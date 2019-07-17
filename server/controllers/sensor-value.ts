import mongoose from 'mongoose';
import {OneDocumentPerValueStrategy} from '../strategies/one-document-per-value-strategy';
import {OneDocumentPerTransactionStrategy} from '../strategies/one-document-per-transaction-strategy';
import {StorageStrategy} from '../strategies/storageStrategy';
import {catTrans} from '../config';
import superagent from 'superagent';


export default class CometCtrl {

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

  orionUpdateInterval = 0;
  chunkSize = 100;

  cache = {};
  orionCache = {};
  storageStrategies = {
    ONE_DOCUMENT_PER_VALUE: OneDocumentPerValueStrategy,
    ONE_DOCUMENT_PER_TRANSACTION: OneDocumentPerTransactionStrategy
  };

  constructor() {
  }


}

