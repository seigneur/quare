#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { QuareBackendStack } from '../lib/quare-backend-stack';

const app = new cdk.App();
new QuareBackendStack(app, 'QuareBackendStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'ap-southeast-1',
  },
});
