#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "@aws-cdk/core";
import { CdkStack } from "../lib/cdk-stack";

const app = new cdk.App();

const env = app.node.tryGetContext("env") || "dev"; 
const tmp = app.node.tryGetContext(env);
const context = {
 ENVStage: env,
 DataBucketName: tmp.DataBucketName,
 GlueScriptLocation: tmp.GlueScriptLocation,
 GlueLibraryLocation: tmp.GlueLibraryLocation,
 GlueConnectionName: tmp.GlueConnectionName,
 VectorOutputFile: tmp.VectorOutputFile,
 FaissIndexOutputFile: tmp.FaissIndexOutputFile,
 ContainerImageTag: tmp.ContainerImageTag,
 VpcId: tmp.VpcId,
 SubnetIds: tmp.SubnetIds,
 ServiceRoleForBatchARN: tmp.ServiceRoleForBatchARN,
 JobRoleARN: tmp.JobRoleARN,
 JobOverrideCommand: tmp.JobOverrideCommand,
 JobImageTagName: tmp.JobImageTagName,
 JobvCPUS: tmp.JobvCPUS,
 JobMemoryLimitMiB: tmp.JobMemoryLimitMiB,
}

new CdkStack(app, `RecommendEngineStack-${env}`, context, {
 env: {
   account: process.env.CDK_DEFAULT_ACCOUNT,
   region: "任意のリージョン",
 },
});