import * as cdk from '@aws-cdk/core';
import * as glue from "@aws-cdk/aws-glue";
import * as s3 from '@aws-cdk/aws-s3'
import * as iam from "@aws-cdk/aws-iam";
import * as s3Deploy from '@aws-cdk/aws-s3-deployment'
import { ContainerBatch } from "./container-batch";
import * as tasks from "@aws-cdk/aws-stepfunctions-tasks";
import * as logs from "@aws-cdk/aws-logs";
import { Rule, Schedule } from '@aws-cdk/aws-events';
import * as sfn from "@aws-cdk/aws-stepfunctions";
import * as targets from "@aws-cdk/aws-events-targets";

export interface Context {
  ENVStage: string;
  DataBucketName: string,
  GlueScriptLocation: string;
  GlueLibraryLocation: string;
  GlueConnectionName: string;
  VectorOutputFile: string;
  FaissIndexOutputFile: string;
  ContainerImageTag: string;
  VpcId: string;
  SubnetIds: string[];
  ServiceRoleForBatchARN: string;
  JobRoleARN: string;
  JobOverrideCommand: string[];
  JobImageTagName: string;
  JobvCPUS: number;
  JobMemoryLimitMiB: number;
  EventBridgeWeekday: string;
  EventBridgeHour: string;
}

export class CdkStack extends cdk.Stack {
  constructor(
    scope: cdk.Construct,
    id: string,
    context: Context,
    props?: cdk.StackProps
  ) {
    super(scope, id, props);

    // The code that defines your stack goes here

    // #region Glue
    // Glue の script をアップロードする先のS3バケット
    const dataBucket = s3.Bucket.fromBucketAttributes(this, 'DevDataBucket', {
      bucketArn: `arn:aws:s3:::${context.DataBucketName}`
    });

    // Glue の script をデプロイ
    new s3Deploy.BucketDeployment(this, 'GlueScriptDeploy', {
      // アップロードするデータの場所を指定します
      sources: [s3Deploy.Source.asset('../glue/src')],
      // アップロード先のバケットは一つ前で作ったものです
      destinationBucket: dataBucket,
      destinationKeyPrefix: context.GlueScriptLocation
    })
    
    // Glue 用の Python Library をデプロイ
    new s3Deploy.BucketDeployment(this, 'GluePythonLibraryDeploy', {
      // アップロードするデータの場所を指定します
      sources: [s3Deploy.Source.asset('../glue/lib')],
      // アップロード先のバケットは一つ前で作ったものです
      destinationBucket: dataBucket,
      destinationKeyPrefix: context.GlueLibraryLocation
    })

    // Glue 用の IAM をデプロイ
    const glueIAMRole = new iam.Role(
      this,
      `CalculateStudentKeywordBERTVectorsIAMRole-${context.ENVStage}`,
      {
        assumedBy: new iam.CompositePrincipal(
          new iam.ServicePrincipal("glue.amazonaws.com")
        ),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName(
            "service-role/AWSGlueServiceRole"
          ),
        ],
        inlinePolicies: {
          inlinePolicies: iam.PolicyDocument.fromJson({
            Version: "2012-10-17",
            Statement: [
              {
                Sid: "ListObjectsInBucket",
                Effect: "Allow",
                Action: ["s3:ListBucket"],
                Resource: [`arn:aws:s3:::${context.DataBucketName}`],
              },
              {
                Sid: "AllObjectActions",
                Effect: "Allow",
                Action: "s3:*Object",
                Resource: [`arn:aws:s3:::${context.DataBucketName}/*`],
              },
            ],
          }),
        },
      }
    );

    // Glue Job
    const glueJob = new glue.CfnJob(
      this,
      `CalculateStudentKeywordBERTVectors-${context.ENVStage}`,
      {
        name: `CalculateStudentKeywordBERTVectors-${context.ENVStage}`,
        command: {
          name: "glueetl",
          pythonVersion: "3",
          scriptLocation: `s3://${context.DataBucketName}/${context.GlueScriptLocation}/calculate-student-keyword-bert-vectors.py`,
        },
        role: glueIAMRole.roleArn,
        numberOfWorkers: 2,
        connections: {
          connections: [context.GlueConnectionName,]
        },
        glueVersion: "2.0",
        workerType: "G.1X",
        defaultArguments: {
          "--additional-python-modules": "torch==1.8.1, fugashi==1.1.0, transformers==4.5.1, ipadic==1.0.0",
          "--python-modules-installer-option": "--upgrade",
          "--data_bucket_name": context.DataBucketName,
          "--vector_output_file": context.VectorOutputFile,
          "--connection_name": context.GlueConnectionName,
        },
        tags: {
          "ForUpdate": "for update hohoho",
        }
      }
    );

    // #endregion Glue

    // #region AWS Batch
    const batchName = `CalculateFaissIndexBatch-StudentKeywordBERT-${context.ENVStage}`;
    // Dockerイメージを作成してECRにプッシュ
    const imageAsset: cdk.DockerImageAssetLocation = this.synthesizer.addDockerImageAsset({
      sourceHash: context.JobImageTagName,
      directoryName: `../../batch`,
      repositoryName: `calculate-faiss-index-batch-student-keyword-bert-${context.ENVStage}`,
    })

    const awsBatch = new ContainerBatch(this, batchName, {
      name: batchName,
      vpcId: context.VpcId,
      subnetIds: context.SubnetIds,
      serviceRoleForBatchARN: context.ServiceRoleForBatchARN,
      jobRoleARN: context.JobRoleARN,
      jobOverrideCommand: context.JobOverrideCommand,
      jobEnvironment: {
        TZ: "Asia/Tokyo",
        ENV: `${context.ENVStage}`,
        DATA_BUCKET_NAME: context.DataBucketName,
        VECTOR_OUTPUT_FILE: context.VectorOutputFile,
        FAISS_INDEX_OUTPUT_FILE: context.FaissIndexOutputFile,
      },
      jobImageRepositoryName: imageAsset.repositoryName,
      jobImageTagName: context.JobImageTagName,
      jobvCPUS: context.JobvCPUS,
      jobMemoryLimitMiB: context.JobMemoryLimitMiB,
    });

    // #endregion AWS Batch

    // Step Functions

    const errorHandlerState = new sfn.Fail(this, "jobFailed", {
      cause: "Invalid response.",
      error: "ErrorA",
    })

    // Tasks of Step Functions
    const glueJobTask = new tasks.GlueStartJobRun(
      this,
      `CalculateStudentKeywordBERTVectorsTask-${context.ENVStage}`,
      {
        glueJobName: glueJob.name || "",
        resultPath: '$.firstResult',
        integrationPattern: sfn.IntegrationPattern.RUN_JOB
      }
    ).addCatch(errorHandlerState);
    
    const AWSBatchTask = new tasks.BatchSubmitJob(
      this,
      `CalculateFaissIndexTask-StudentKeywordBERT-${context.ENVStage}`,
      {
        jobDefinitionArn: awsBatch.jobDefinitionArn, 
        jobName: batchName,
        jobQueueArn: awsBatch.jobQueueArn,
        resultPath: '$.secondResult',
      }
    ).addCatch(errorHandlerState);
    const definition = glueJobTask.next(AWSBatchTask);

    const logGroup = new logs.LogGroup(this, 'aws/statemachine/keywordBERT');

    // State Machine
    const stateMachine = new sfn.StateMachine(this, `KeywordBERTSimilarStudentStateMachine-${context.ENVStage}`, {
      definition,
      timeout: cdk.Duration.minutes(150),
      logs: {
        destination: logGroup,
        level: sfn.LogLevel.ALL,
      }
    });

    // Event Bridge
    const stateMachineTarget = new targets.SfnStateMachine(stateMachine);

    new Rule(this, `ScheduleRule-${context.ENVStage}`, {
      schedule: Schedule.cron({ minute: '0', hour: context.EventBridgeHour, weekDay: context.EventBridgeWeekday}),
      targets: [stateMachineTarget],
    });
  }
}
