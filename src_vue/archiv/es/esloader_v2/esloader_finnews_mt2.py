
import csv
from datetime import datetime
from elasticsearch import Elasticsearch
import json
import sys
import argparse
import os
from multiprocessing import Process
from elasticsearch.helpers import bulk
from elasticsearch.helpers import streaming_bulk
from elasticsearch.helpers import parallel_bulk
import urllib3
import logging

def parserthreadfunc(esserver, esport, esindex, indexfile, start, end, parsetype, workerid):
   
    
    # read docs & pushing to elasticsearch
    def generate():
        with open(indexfile, newline='', encoding="UTF-8") as f:
            reader = csv.reader(f, delimiter="\t", quoting=csv.QUOTE_NONE)
            # skip first rows until start
            for i in range(start):
                next(reader)
            counter = start
            printcounter = 0
            for row in reader:
                # interval does not include end
                if counter >= end:
                    break
                ############### parse
                # jo - field is ignored (duplicate information to jobim field)
                #josi = row[0]
                #jos = josi.split("<>")
                # jobim field is parsed into jo-bims (seperatedly searchable)
                jobimsdb = row[1]
                jobims = jobimsdb.split("<>")
                jobimsES = []
                for jobim in jobims:
                    #print(jobim, counter)
                    jobs = jobim.split("@") 
                    jo = jobs[0]
                    if len(jobs)>1:
                        bim = jobs[1]
                    else:
                        bim = ""
                    jobimsES.append({"jo": jo, "bim": bim})
                # source field
                source = row[2]
                # text field
                sentence = row[3]
                #time-slice field = date field with this text file
                # de70 [1995, 1999]
                if parsetype=="de70":
                    time_slice = row[4][1:5]+"-"+row[4][-5:-1]
                # fin 1995-1999
                else:
                    time_slice = row[4]

                # no date field with these two txt files
        
                ######### index in es

                doc = { "_index": esindex,
                "_id": counter,
                "_source": {
                    'jobim': jobimsES,
                    'sentence': sentence,
                    'source': source,
                    'date': time_slice,
                    'time_slice': time_slice
                    }
                }
            
                #print (doc)
            
                ##### count and log
                printcounter += 1
                if (printcounter == 10):
                    #now = datetime.now()
                    #date_time = now.strftime("%m/%d/%Y, %H:%M:%S")
                    logging.info("indexing importfile " + str(indexfile) + "line number" + str(counter) + "to es index" + str(esindex))
                    printcounter = 0
                #es.indices.refresh(index=esindex)
                counter += 1
                yield doc
                
                
     # settings
    es = Elasticsearch([{'host': esserver, 'port': esport}])
    #log = open(logfile, "a")
    logging.info("Worker" + str(workerid) + " now indexing documents...")
    successes = 0
    try:
        for ok, action in parallel_bulk(
            client=es, actions=generate()
        ):
            successes += ok
    except:
        string = "Worker" + str(workerid) + " error at number " + str(start + successes)
        print(string)
    string = "Worker" + str(workerid) + " hat indiziert und ist nun at " + str(start + successes)
    print(string)

def main(esserver, esport, esindex, indexfile, start, end, parstype, workers, logfile):
    # Param: importfile - file to index - in line - tab format like finnews.txt
    # Param: start - line to start from file (just in case it has been stopped at some point)
    # param: indexname - elasticsearch index to use
    # not including the END
    logging.basicConfig(filename=logfile, encoding='utf-8', level=logging.DEBUG)
    # set workers and docs to process
    workers = int(workers)
    interval = int(end) - int(start)
    # fit interval to workers nach oben
    if (interval % workers) != 0:
        interval += workers - (interval % workers)
    # workerinterval should be integer now
    workerinterval = int (interval / workers) 
    workerid = 0
    for work in range(workers):
        startw = int(start) + work * workerinterval
        endw = int(start) + (work +1) * workerinterval
        string = "worker starting with id" + str(workerid) + "parsing docs from to" + str(startw) + " " + str(endw)
        print(string)
        p = Process(target=parserthreadfunc, args=(esserver, esport, esindex, indexfile, startw, endw, parstype, workerid))
        p.start()
        workerid += 1
    

def create_arg_parser():
    # Creates and returns the ArgumentParser object
    parser = argparse.ArgumentParser(description='scot-helper loads tab-sep lines from txt-file and pushes to elasticsearch.')
    parser.add_argument('esserver',
                    help='elastic host address or name')
    parser.add_argument('esport',
                    help='elastic port')
    parser.add_argument('esindex',
                    help='name of asticsearch index')
    parser.add_argument('indexfile',
                    help='Path to the input file file.txt.')
    parser.add_argument('start',
                    help='start indexing at line')
    parser.add_argument('end',
                    help='end indexing at line')
    parser.add_argument('parstype',
                    help='deals with different dates in fin and de70')
    parser.add_argument('workers',
                    help='number of workers')
    parser.add_argument('logfile',
                    help='path to logfile ie dirfile.txt')
    
    
    return parser

if __name__ == "__main__":
    # user needs to enter elastic_server[dockername or Ip], es-index-name, file-to-indes, start, end
    # read file to index[1] and start[2]
    arg_parser = create_arg_parser()
    parsed_args = arg_parser.parse_args(sys.argv[1:])
    print("esserver", parsed_args.esserver)
    # eserver = "elasticsearch"
    print("esport", parsed_args.esport)
    # esport = "9200"
    print("esindex", parsed_args.esindex)
    #esindex = "test3"
    print("indexfile", parsed_args.indexfile)
    #indexfile = "C:/Users/hitec_c/Documents/finnews_dep_wft.txt"
    print("start", parsed_args.start)
    print("end", parsed_args.end)
    print("parstype", parsed_args.parstype)
    # disable multiprocessing - and use thread-api
    parsed_args.workers = 1
    print("workers number", parsed_args.workers)
    print("logfile", parsed_args.logfile)
    #parsed_args.logfile = "C:/Users/hitec_c/Documents/finnews_log.txt"
    
        
    main(parsed_args.esserver, parsed_args.esport, parsed_args.esindex, parsed_args.indexfile, parsed_args.start, parsed_args.end, parsed_args.parstype, parsed_args.workers, parsed_args.logfile)
