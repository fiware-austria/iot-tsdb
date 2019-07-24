import mongoose from 'mongoose';

import {qTrans} from '../config';
import superagent from 'superagent';


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

  collection2ContextElement = (documents: {}[], attrNames: string[], entity_name: string) => ({
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
  });

  process = async (req, res, next) => {
    try {
      const lastN = parseInt( req.query.lastN || '0', 10);
      const hLimit = parseInt( req.query.hLimit || '0', 10);
      const hOffset = parseInt( req.query.hOffset || '0', 10);
      let dateFrom, dateTo;
      if (req.query.hasOwnProperty('dateFrom')) {
        dateFrom = new Date(req.query.dateFrom);
      }
      if (req.query.hasOwnProperty('dateTo')) {
        dateTo = new Date(req.query.dateTo);
      }
      if (lastN + hLimit === 0) {
        throw new Error('Either "lastN" or "hLimit/hOffset" need to be used as query parameters');
      }
      if (lastN > 0 && hLimit > 0) {
        throw new Error('You must not use lastN AND hLimit. Use one of them!');
      }
      if (lastN + hLimit > this.maxResults) {
        throw new Error(`lastN or hLimit must not exceed configure MAX_RESULTS (currently ${this.maxResults})`)
      }
      const tenant = req.headers['fiware-service'] || '';
      const attributes = req.params.attrNames.split(',');
      const entity_ids = req.params.entityId.split(',');
      const entity_type = req.params.entityType;
      const collectionName = process.env.STH_PREFIX + '_'  + tenant +  '_' + entity_type;
      const projection = attributes.reduce((acc, attr) => {acc[attr] = 1; return acc; },
        {'timestamp': 1, 'entity_name': 1, 'entity_type': 1});
      qTrans.info('Using collection: ' + collectionName);
      qTrans.info('Projection: ' + JSON.stringify(projection));
      const collection = this.db.collection(collectionName);
      const entity_docs: {}[][] = await Promise.all(entity_ids.map(id => {
        const constraints = {entity_name: id};
        let timeSort = -1;
        if (dateFrom) {
          constraints['timestamp'] = {'$gte': dateFrom}
          timeSort = 1;
        }
        if (dateTo) {
          if (dateFrom) {
            constraints['timestamp']['$lte'] = dateTo
          } else {
            constraints['timestamp'] = {'$lte': dateTo}
          }
          timeSort = -1;
        }
        qTrans.debug('Query constraints: ' + JSON.stringify(constraints));
        const query = collection.find(constraints, projection).sort({timestamp: timeSort});
        return query.skip(hOffset).limit(lastN + hLimit).toArray();
      }));
      const result = { contextResponses: entity_docs
          .map((docs, idx) => this.collection2ContextElement(docs, attributes, entity_ids[idx]))};
      res.send(result)
    } catch (err) {
      res.status(400).send({message: err.message || JSON.stringify(err)})
    }
  }


}

