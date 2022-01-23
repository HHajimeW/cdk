import numpy as np
import pandas as pd
import faiss

import io
import os
import boto3
from logging42 import logger

def get_s3file(bucket_name, key):
    s3 = boto3.resource('s3')
    s3obj = s3.Object(bucket_name, key).get()

    return io.TextIOWrapper(io.BytesIO(s3obj['Body'].read()))

def upload_s3file(index, file_name, bucket_name, key):
    if not os.path.exists(file_name):
        f = open(file_name,'w')
        f.write('')
        f.close()

    faiss.write_index(index, file_name)
    return boto3.Session().resource('s3').Bucket(bucket_name).Object(key).upload_file(file_name)

def download_s3file(bucket_name, file_name, key):
    if not os.path.exists(file_name):
        f = open(file_name, 'w')
        f.write('')
        f.close()

    s3 = boto3.resource('s3')
    return s3.Bucket(bucket_name).download_file(Filename=file_name, Key=key)

def write_similar_student_with_keyword(event, context=None):

    env_stage = os.getenv('ENV')
    data_bucket_name = os.getenv('DATA_BUCKET_NAME')
    vector_output_file = os.getenv('VECTOR_OUTPUT_FILE')
    faiss_index_output_file = os.getenv('FAISS_INDEX_OUTPUT_FILE')

    # region calculate faiss index
    # 学生の vector をロード
    logger.info("ここでGlueによって、計算されたの学生ベクトルを読み込み")

    # Indexを計算
    logger.info("ここで学生のfaissインデックスを計算")
    
    # indexデータを保存
    file_name = '/tmp/saved-index.faiss'
    upload_flg = upload_s3file(index, file_name, data_bucket_name, faiss_index_output_file)
    
    # endregion calculate faiss index
    
    # region write similar student to dynamodb
    # Search
    print("ここで類似学生を検索")

    # DynamoDB put item
    try:
        print("ここでDynamoDBに類似学生を書き込み")

    except Exception as error:
        logger.error(error)
        raise error

    # endregion write similar student to dynamodb
        
    return "ok"
    

if __name__ == "__main__":
    write_similar_student_with_keyword({})
