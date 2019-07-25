import mongoose from 'mongoose';

import {qTrans} from '../config';
import superagent from 'superagent';
import {Request, Response} from 'express';


interface RequestInfo {
  lastN: number,
  hLimit: number,
  hOffset: number,
  dateFrom?: Date,
  dateTo?: Date,
  count: boolean,
  tenant: string,
  attributes: [string],
  entity_ids: [string],
  entity_type: string,
  collectionName: string,
}


export default class CometCtrl {

  db = mongoose.connection;
  maxResults = parseInt(process.env.MAX_RESULTS || '1000', 10);
  prefix = process.env.STH_PREFIX;
  orionEnabled = false;
  parsers = {
    Float: parseFloat,
    Int: parseInt,
    Integer: parseInt,
    Date: s => new Date(s),
    String: s => s,
    Location: s => ({type: 'Point', coordinates: s.split(',').map(parseFloat).reverse()})
  };


  constructor() {
  }

  documents2Attribute = (documents: {}[], attrNames: string[]) =>
     documents.reduce((attValues, doc) => {
         attrNames.forEach(name => {
           attValues[name]
             .push({recvTime: doc['timestamp'], attrValue: doc[name]})
         });
         return attValues;
       },
       attrNames.reduce((acc, name) => {acc[name] = []; return acc}, {}))



  collection2ContextElement = (documents: {}[], attrNames: string[], entity_name: string, count: number) => {
    const response = {
      contextElement: {
        id: entity_name,
        isPattern: false,
        attributes: documents.length === 0 ? [] : Object.entries(this.documents2Attribute(documents, attrNames))
          .map(([key, value]) => ({
            name: key,
            values: value
          }))
      },
      statusCode: {
        code: 200,
        reasonPhrase: 'OK'
      }
    }
   if (count > 0) {
     response.contextElement['count'] = count;
   }
   return response;
  }



  extractRequestInfo: (Request) => RequestInfo = (req: Request) => {
    const tenant = req.headers['fiware-service'].toString() || '';
    const entity_type = req.params.entityType;
    const result: RequestInfo = {
      lastN: parseInt( req.query.lastN || '0', 10),
      hLimit: parseInt( req.query.hLimit || '0', 10),
      hOffset: parseInt( req.query.hOffset || '0', 10),
      count: req.query.hasOwnProperty('count'),
      tenant: tenant,
      attributes: req.params.attrNames.split(','),
      entity_ids: req.params.entityId.split(','),
      entity_type: entity_type,
      collectionName: process.env.STH_PREFIX + '_'  + tenant +  '_' + entity_type,
    };
    if (req.query.hasOwnProperty('dateFrom')) {
      result.dateFrom = new Date(req.query.dateFrom);
    }
    if (req.query.hasOwnProperty('dateTo')) {
      result.dateTo = new Date(req.query.dateTo);
    }
    if (result.lastN + result.hLimit === 0) {
      throw new Error('Either "lastN" or "hLimit/hOffset" need to be used as query parameters');
    }
    if (result.lastN > 0 && result.hLimit > 0) {
      throw new Error('You must not use lastN AND hLimit. Use one of them!');
    }
    if (result.lastN + result.hLimit > this.maxResults) {
      throw new Error(`lastN or hLimit must not exceed configure MAX_RESULTS (currently ${this.maxResults})`)
    }
    if (result.dateFrom && result.dateTo && result.dateFrom > result.dateTo) {
      throw new Error('dateTo cannot be smaller than dateFrom')
    }
    return result;
  }


  process = async (req: Request, res: Response, next) => {
    try {
      const info = this.extractRequestInfo(req);
      const projection: {} = info.attributes.reduce((acc, attr) => {acc[attr] = 1; return acc; },
        {'timestamp': 1, 'entity_name': 1, 'entity_type': 1});
      qTrans.info('Using collection: ' + info.collectionName);
      qTrans.info('Projection: ' + JSON.stringify(projection));
      const collection = this.db.collection(info.collectionName);
      const time_constraints = {}
      let timeSort = -1;
      if (info.dateFrom) {
        time_constraints['timestamp'] = {'$gte': info.dateFrom}
        timeSort = 1;
      }
      if (info.dateTo) {
        if (info.dateFrom) {
          time_constraints['timestamp']['$lte'] = info.dateTo
        } else {
          time_constraints['timestamp'] = {'$lte': info.dateTo}
        }
        timeSort = -1;
      }
      let countQueries = [];
      if (info.count) {
         countQueries = info.entity_ids.map(id => {
           const constraints = Object.assign({entity_name: id}, time_constraints);
           qTrans.debug('Query constraints for counting: ' + JSON.stringify(constraints));
           return collection.count(constraints);
          })
      }
      const documentQueries = info.entity_ids.map(id => {
        const constraints = Object.assign({entity_name: id}, time_constraints);
        qTrans.debug('Query constraints: ' + JSON.stringify(constraints));
        const query = collection.find(constraints, projection).sort({timestamp: timeSort});
        return query.skip(info.hOffset).limit(info.lastN + info.hLimit).toArray();
      });
      const all_docs: any = await Promise.all(documentQueries.concat(countQueries))
      const entity_docs = info.count ? all_docs.slice(0, all_docs.length / 2) : all_docs;
      const counts = info.count ? all_docs.slice(all_docs.length / 2) : [];
      const result = { contextResponses: entity_docs
          .map((docs, idx) => this.collection2ContextElement(docs, info.attributes, info.entity_ids[idx],
            info.count ? counts[idx] : 0 ))};
      res.send(result)
    } catch (err) {
      res.status(400).send({message: err.message || JSON.stringify(err)})
    }
  }


}

