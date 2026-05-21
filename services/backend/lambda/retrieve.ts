import { S3Client, GetObjectCommand, NoSuchKey } from '@aws-sdk/client-s3';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

const s3 = new S3Client({});
const BUCKET = process.env.BUCKET_NAME!;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const pin = event.pathParameters?.pin;
  if (!pin || !/^\d{6}$/.test(pin)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid pin' }) };
  }

  try {
    const response = await s3.send(new GetObjectCommand({
      Bucket: BUCKET,
      Key: `documents/${pin}.json`,
    }));

    const body = await response.Body!.transformToString();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body,
    };
  } catch (err) {
    if (err instanceof NoSuchKey) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Document not found' }) };
    }
    throw err;
  }
};
