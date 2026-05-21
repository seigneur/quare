import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import * as path from 'path';

export class QuareBackendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const bucket = new s3.Bucket(this, 'DocumentsBucket', {
      bucketName: `quare-documents-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const storeFn = new NodejsFunction(this, 'StoreFunction', {
      entry: path.join(__dirname, '../lambda/store.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      environment: { BUCKET_NAME: bucket.bucketName },
      timeout: cdk.Duration.seconds(10),
    });

    const retrieveFn = new NodejsFunction(this, 'RetrieveFunction', {
      entry: path.join(__dirname, '../lambda/retrieve.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      environment: { BUCKET_NAME: bucket.bucketName },
      timeout: cdk.Duration.seconds(10),
    });

    bucket.grantPut(storeFn);
    bucket.grantRead(retrieveFn);

    const api = new apigateway.RestApi(this, 'QuareApi', {
      restApiName: 'Quare Document API',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
    });

    const documents = api.root.addResource('documents');
    documents.addMethod('POST', new apigateway.LambdaIntegration(storeFn));

    const document = documents.addResource('{pin}');
    document.addMethod('GET', new apigateway.LambdaIntegration(retrieveFn));

    new cdk.CfnOutput(this, 'ApiUrl', { value: api.url });
    new cdk.CfnOutput(this, 'BucketName', { value: bucket.bucketName });
  }
}
