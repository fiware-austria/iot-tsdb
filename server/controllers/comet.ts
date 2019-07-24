import mongoose from 'mongoose';

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


  constructor() {
  }

  process = (req, res, next) => {
    res.send({message: 'ok'})
  }


}

