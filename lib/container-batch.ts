import * as cdk from "@aws-cdk/core";
import * as ec2 from "@aws-cdk/aws-ec2";
import * as iam from "@aws-cdk/aws-iam";
import * as ecr from "@aws-cdk/aws-ecr";
import * as ecs from "@aws-cdk/aws-ecs";
import * as batch from "@aws-cdk/aws-batch";

export interface ContainerBatchProps {
  readonly name: string;
  readonly vpcId: string;
  readonly subnetIds: string[];
  readonly serviceRoleForBatchARN: string;
  readonly jobRoleARN: string;
  readonly jobOverrideCommand: string[];
  readonly jobEnvironment: {
    [key: string]: string;
  };
  readonly jobImageRepositoryName: string;
  readonly jobImageTagName: string;
  readonly jobvCPUS: number;
  readonly jobMemoryLimitMiB: number;
}

export class ContainerBatch extends cdk.Construct {

  public jobDefinitionArn: string;
  public jobQueueArn: string;

  constructor(scope: cdk.Construct, id: string, props: ContainerBatchProps) {
    super(scope, id);

    const vpc = ec2.Vpc.fromLookup(this, "VPC", {
      vpcId: props.vpcId,
    });

    const selectSubnets = vpc.selectSubnets({
      subnets: props.subnetIds.map((subnetId) =>
        // ec2.Subnet.fromSubnetId(this, "Subnet", subnetId)
        ec2.Subnet.fromSubnetAttributes(this, `${subnetId}-Subnet`, {
          availabilityZone: "dummy",
          subnetId: subnetId,
        })
      ),
    });

    const securityGroup = new ec2.SecurityGroup(this, "SecurityGroup", {
      vpc: vpc,
    });

    const serviceRoleForBatch = iam.Role.fromRoleArn(
      this,
      "ServiceRoleForBatch",
      props.serviceRoleForBatchARN
    );

    const computeEnvironment = new batch.ComputeEnvironment(
      this,
      "BatchComputeEnvironment",
      {
        computeEnvironmentName: `${props.name}-ComputeEnvironment`,
        computeResources: {
          type: batch.ComputeResourceType.ON_DEMAND,
          vpc: vpc,
          vpcSubnets: selectSubnets,
          securityGroups: [securityGroup],
        },
        serviceRole: serviceRoleForBatch,
      }
    );

    const jobRole = iam.Role.fromRoleArn(
        this,
        "BatchJobRole",
        props.jobRoleARN
      );

    const jobQueue = new batch.JobQueue(this, "JobQueue", {
      jobQueueName: `${props.name}-JobQueue`,
      computeEnvironments: [
        {
          computeEnvironment: computeEnvironment,
          order: 1,
        },
      ],
    });

    this.jobQueueArn = jobQueue.jobQueueArn

    // ECRからリポジトリを取得
    const repository: ecr.IRepository = ecr.Repository.fromRepositoryName(
        this,
        `ECRRepository`,
        props.jobImageRepositoryName,
    )
    
    // リポジトリから特定のイメージを取得
    const image = ecs.ContainerImage.fromEcrRepository(repository, props.jobImageTagName)

    const batchJobDefinition = new batch.JobDefinition(this, "JobDefinition", {
      jobDefinitionName: `${props.name}-JobDefinition`,
      container: {
        environment: props.jobEnvironment,
        image: image,
        jobRole: jobRole,
        vcpus: props.jobvCPUS,
        memoryLimitMiB: props.jobMemoryLimitMiB,
      },
    });

    this.jobDefinitionArn = batchJobDefinition.jobDefinitionArn;
  }
}