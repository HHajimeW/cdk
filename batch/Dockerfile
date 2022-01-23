FROM continuumio/miniconda3

MAINTAINER hajime watanabe

ENV TZ=Asia/Tokyo

# conda create
RUN conda install python==3.8

# faiss をインストール
SHELL ["/bin/bash", "-l", "-c"]

RUN . /opt/conda/bin/activate \
 && conda install faiss-cpu -c pytorch

# その他必要なライブラリのインストール
RUN pip install pyathena 
RUN pip install pandas
RUN pip install logging42

WORKDIR /app/
COPY . /app
WORKDIR /app/src/

ENTRYPOINT [ "/opt/conda/bin/python", "write_data_to_dynamodb.py" ]