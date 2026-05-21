import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

const s3 = new S3Client({});
const BUCKET = process.env.BUCKET_NAME!;

function generatePin(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  if (!event.body) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Body required' }) };
  }

  const pin = generatePin();

  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: `documents/${pin}.json`,
    Body: event.body,
    ContentType: 'application/json',
  }));

  return {
    statusCode: 201,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ pin }),
  };
};
