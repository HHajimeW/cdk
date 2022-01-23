import numpy as np
import pandas as pd

import sys

from awsglue.context import GlueContext
from awsglue.utils import getResolvedOptions

from pyspark.context import SparkContext
import pyspark.sql.functions as f
from pyspark.sql.functions import col

import boto3

# BERT
import torch
from transformers import BertJapaneseTokenizer
from transformers import BertJapaneseTokenizer, BertModel

# region save vectors to s3
args = getResolvedOptions(sys.argv, ['connection_name', 'data_bucket_name', 'vector_output_file'])
connection_name = args['connection_name']
data_bucket_name = args['data_bucket_name']
vector_output_file = args['vector_output_file']

# region initialize Spark, Glue context, jdbc 
sc = SparkContext.getOrCreate()
glueContext = GlueContext(sc)
spark = glueContext.spark_session
src_jdbc = glueContext.extract_jdbc_conf(connection_name=connection_name)
# endregion initialize Spark, Glue context, jdbc

# region initialize bert model
TOKENIZER = BertJapaneseTokenizer.from_pretrained('cl-tohoku/bert-base-japanese-whole-word-masking')
MODEL_BERT = BertModel.from_pretrained('cl-tohoku/bert-base-japanese-whole-word-masking', output_hidden_states=True)
MODEL_BERT.eval()
# endregion bert model

# region calc bert embedding
def calc_embedding(text):
    bert_tokens = TOKENIZER.tokenize(text)
    ids = TOKENIZER.convert_tokens_to_ids(["[CLS]"] + bert_tokens[:126] + ["[SEP]"])
    tokens_tensor = torch.tensor(ids).reshape(1, -1)
    with torch.no_grad():
        output = MODEL_BERT(tokens_tensor)
    return output[1].numpy()
# endregion 

# region 単語ベクトルの平均を取得する関数
def calculate_word_vector_center(text):
    
    return "単語の平均ベクトル"
# endregion 単語ベクトルの平均を取得する関数

# region fetch data
def fetch_rds_table_dataframe(tablename):
    """指定したテーブル名の pyspark dataframe を取得する

    Arguments:
    - tablename {str} -- DB テーブル名
    
    Returns:
    - df -- DB テーブル dataframe
    """
    df = glueContext.create_dynamic_frame_from_options(
        connection_type=src_jdbc['vendor'],
        connection_options={
            "url": src_jdbc['url'] + "/" + "任意のDB名",
            "user": src_jdbc['user'],
            "password": src_jdbc['password'],
            "dbtable": tablename
        }
    ).toDF()

    return df
# endregion fetch data

# region save numpy to s3 with csv
def numpy_to_csv_in_s3(np_data, bucket_name, key):
    np.savetxt('student_vectors.csv', X=np_data, delimiter=",")
    boto3.Session().resource('s3').Bucket(bucket_name).Object(key).upload_file('student_vectors.csv')
# endregion save numpy to s3 with csv

if __name__ == "__main__":
    # region fetch account tag data
    df_account_tags = fetch_rds_table_dataframe("テーブル名")

    df = df_account_tags.toPandas()
    # endregion fetch account tag data
    
    # region calculate vectors
    saved_np = "numpy array の形で学生のキーワードベクトルを保存"
    # endregion calculate vectors

    bucketname = data_bucket_name
    key = vector_output_file

    numpy_to_csv_in_s3(saved_np, bucketname, key)
    # endregion save vectors to s3