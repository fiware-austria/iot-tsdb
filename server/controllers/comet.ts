import mongoose, {Collection} from 'mongoose';

import {qTrans} from '../config';
import {Request, Response} from 'express';


enum AggregationMethods {'avg', 'min' , 'max' , 'sum'}
enum AggregationPeriods {'year', 'second', 'minute', 'hour', 'month', 'halfhour', 'quarterhour', 'week'}

type AggregationMethod =  keyof AggregationMethods;
type AggregationPeriod =  keyof AggregationPeriods

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
  aggrMethod?: AggregationMethod,
  aggrPeriod?: AggregationPeriod
}


const aggregationMethod = (name: AggregationMethod) => ({
  'avg': '$avg',
  'sum': '$sum',
  'min': '$min',
  'max': '$max'
}[name]);


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
    Location: s => ({type: 'Point', coordinates: s.split(',').map(parseFloat).reverse()}),
    'geo:point': s => ({type: 'Point', coordinates: s.split(',').map(parseFloat).reverse()})
  };

  date = {date: '$timestamp', timezone: 'Europe/Vienna'};

  timeElements = {
     year: {func: {'$year': this.date}, includes: ['year']},
     month: {func: {'$month': this.date}, includes: ['year', 'month']},
     week: {func: {'$week': this.date}, includes: ['year', 'week']},
     day: {func: {'$dayOfYear': this.date}, includes: ['year', 'day']},
     hour: {func: {'$hour': this.date}, includes: ['year', 'day', 'hour']},
     minute: {func: {'$minute': this.date}, includes: ['year', 'day', 'hour', 'minute']},
     halfhour: {func: {
         $cond: {
           if: { $lt: [{'$minute': this.date}, 30]},
           then: 0,
           else: 1
         }
       }, includes: ['year', 'day', 'hour', 'halfhour']},
     quarterhour: {func: {
         '$switch': {
           'branches': [
             { 'case': { '$lt': [ {'$minute': this.date}, 15 ] }, 'then': 1 },
             { 'case': { '$lt': [ {'$minute': this.date}, 30 ] }, 'then': 2 },
             { 'case': { '$lt': [ {'$minute': this.date}, 45 ] }, 'then': 3 }
           ], 'default': 4
         }
       }, includes: ['year', 'day', 'hour', 'quarterhour']},
     second: {func: {'$second': this.date}, includes: ['year', 'day', 'hour', 'minute', 'second']},
  };


  aggregateQuery = (entity_name: string,
                    attributes: string[],
                    aggMethod: AggregationMethod,
                    aggPeriod: AggregationPeriod,
                    dateFrom: Date, dateTo: Date) => {
    const ts = this.timeElements;
    const match = {
      $and: [
        {entity_name},
        {timestamp: {$gte: new Date(dateFrom)}},
        {timestamp: {$lte: new Date(dateTo)}}
      ]
    }
    const group = {
      _id: {...ts[aggPeriod].includes.reduce((acc, p) => ({[p]: ts[p].func, ...acc}), {})},
      timestamp: {$first: '$timestamp'},
      ...attributes.reduce((acc, att) => ({[att]: {[aggregationMethod(aggMethod)]: `$${att}`}, ...acc}), {}),
    }
    const result = [{$match: match}, {$group: group}, {$sort: {timestamp: 1}}]
    qTrans.debug('result = ' + JSON.stringify(result));
    return result
  }

  constructor() {}

  documents2Attribute = (documents: {}[], attrNames: string[]) =>
    documents.reduce((attValues, doc) => {
        attrNames.forEach(name => {
          attValues[name]
            .push({recvTime: doc['timestamp'], attrValue: doc[name]})
        });
        return attValues;
      },
      attrNames.reduce((acc, name) => {
        acc[name] = [];
        return acc
      }, {}))


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
      lastN: parseInt(req.query.lastN || '0', 10),
      hLimit: parseInt(req.query.hLimit || '0', 10),
      hOffset: parseInt(req.query.hOffset || '0', 10),
      count: req.query.hasOwnProperty('count'),
      tenant: tenant,
      attributes: req.params.attrNames.split(','),
      entity_ids: req.params.entityId.split(','),
      entity_type: entity_type,
      collectionName: process.env.STH_PREFIX + '_' + tenant + '_' + entity_type,
    };
    if ('aggrMethod' in req.query) {
        if (!(req.query.aggrMethod in AggregationMethods)) {
          throw new Error(`Method ${req.query.aggrMethod} is not one of ${Object.keys(AggregationMethods).toString()}`)
        }
        result.aggrMethod = req.query.aggrMethod;
    }
    if ('aggrPeriod' in req.query) {
      if (!(req.query.aggrPeriod in AggregationPeriods)) {
        throw new Error(`Method ${req.query.aggrPeriod} is not one of ${Object.keys(AggregationPeriods).toString()}`)
      }
      result.aggrPeriod = req.query.aggrPeriod;
    }
    if ((result.aggrMethod && !result.aggrPeriod) || (!result.aggrMethod && result.aggrPeriod)) {
      throw new Error('When performing aggregation queries, \'aggrMethod\', and \'aggrPeriod\' need to be provided!')
    }
    if ('dateFrom' in req.query) {
      result.dateFrom = new Date(req.query.dateFrom);
    }
    if ('dateTo' in req.query) {
      result.dateTo = new Date(req.query.dateTo);
    }
    if ('aggrMethod' in result && (!('dateTo' in result) || !('dateFrom' in result))) {
      throw new Error('When performing aggregation queries, \'dateFrom\', and \'dateTo\' need to be provided!')
    }
    if ( !('aggrMethod' in result) && result.lastN + result.hLimit === 0) {
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
      const isAggregation = ('aggrMethod' in info);
      const projection: {} = info.attributes.reduce((acc, attr) => {
          acc[attr] = 1;
          return acc;
        },
        {'timestamp': 1, 'entity_name': 1, 'entity_type': 1});
      qTrans.info('Using collection: ' + info.collectionName);
      qTrans.info('Projection: ' + JSON.stringify(projection));
      const collection = this.db.collection(info.collectionName);
      if (isAggregation) {
        return this.performAggregationQuery(collection, info, res);
      }
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
      const all_docs: any = await Promise.all(documentQueries.concat(countQueries));
      const entity_docs = info.count ? all_docs.slice(0, all_docs.length / 2) : all_docs;
      const counts = info.count ? all_docs.slice(all_docs.length / 2) : [];
      const result = {
        contextResponses: entity_docs
          .map((docs, idx) => this.collection2ContextElement(docs, info.attributes, info.entity_ids[idx],
            info.count ? counts[idx] : 0))
      };
      res.send(result)
    } catch (err) {
      res.status(400).send({message: err.message || JSON.stringify(err)})
    }
  }


  private performAggregationQuery = (collection: Collection, info: RequestInfo, res: Response) =>
    Promise.all(info.entity_ids.map(id =>
      this.aggregateQuery(id, info.attributes, info.aggrMethod, info.aggrPeriod, info.dateFrom, info.dateTo))
      .map(q => collection.aggregate(q).toArray()))
      .then(docs => docs.map((d, idx) => this.collection2ContextElement(d, info.attributes, info.entity_ids[idx],
        0)))
      .then(context => res.send({contextResponses: context}))

}
