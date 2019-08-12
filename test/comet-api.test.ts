import supertest from 'supertest';
import dotenv from 'dotenv';

dotenv.config({path: '.env.test'});
import mongoose from 'mongoose';
import {app} from '../server/app';


// import * as Bluebird from 'bluebird';
import {createUsers, range, saveUsers, getToken} from './helpers';
import User from '../server/models/user';
import {qTrans} from '../server/config';



// (<any>mongoose).Promise = Bluebird;
mongoose.connect(process.env.MONGODB_URI, {useNewUrlParser: true});
const db = mongoose.connection;

const tenant = 'test_tenant';
const entity_type = 'test_sensor';
const STH_PREFIX = process.env.STH_PREFIX || '_sth_test_';

const randomValue = (min: number, max: number) => Math.round((Math.random() * (max - min) + min) * 100) / 100
const delay = ms => new Promise(res => setTimeout(res, ms));

beforeAll(async () => await createTestEntries(3, 1000))
afterAll(async () => await mongoose.connection.collection(collectionName).deleteMany({}));

const random = (min: number, max: number) => Math.random() * (max - min) + min;
const collectionName = STH_PREFIX + '_' + tenant + '_' + entity_type;


const createTestEntries = (numberOfSensors, numberOfSamples) => {
  const ux = Date.parse('01 Jan 2019 00:00:00 GMT');
  return Promise.all(range(numberOfSensors).map( sensor =>
    mongoose.connection.collection(collectionName)
      .insertMany(range(numberOfSamples).map(nr => ({
        sensorId: `sensor_${sensor}`,
        timestamp: new Date(ux + nr * 30000),
        'entity_name': `entity_${sensor}`,
        'entity_type': 'test_sensor',
        'temperature': random(-20, 35),
        'humidity': random(0, 100),
        'airPressure': random(900, 1100),
        'mangOHTemp': random(-20, 35),
        'mangOHPress': random(900, 1100),
        'pm10': random(0, 70),
        'pm25': random(0, 70)
      })))
  ))}


describe('Simple Raw Comet Query', () => {
  it('should not be possible to make a query without lastN or hLimit', async () => {
    const queryResult = await supertest(app)
      .get('/STH/v1/contextEntities/type/test_sensor/id/entity_2/attributes/temperature')
      .set('Fiware-Service', tenant)
      .set('Fiware-ServicePath', '/')
      .send();
    expect(queryResult.status).toEqual(400);
    expect(queryResult.body.message)
      .toEqual('Either "lastN" or "hLimit/hOffset" need to be used as query parameters')
  })
  it('should be possible to get the last 10 entries for a single attribute', async () => {
    const queryResult = await supertest(app)
      .get('/STH/v1/contextEntities/type/test_sensor/id/entity_2/attributes/temperature?lastN=10')
      .set('Fiware-Service', tenant)
      .set('Fiware-ServicePath', '/')
      .send();
    expect(queryResult.status).toEqual(200);
    expect(queryResult.body.contextResponses).toHaveLength(1);
    const contextElement1 = queryResult.body.contextResponses[0].contextElement;
    expect(contextElement1.attributes).toHaveLength(1);
    expect(contextElement1.attributes[0].values).toHaveLength(10);
    expect(contextElement1.attributes[0].name).toEqual('temperature');
    expect(contextElement1.attributes[0].values[0].recvTime).toBeDefined();
    expect(contextElement1.attributes[0].values[0].recvTime).toEqual('2019-01-01T08:20:00.000Z');
    expect(contextElement1.attributes[0].values[9].recvTime).toEqual('2019-01-01T08:15:30.000Z');
    expect(contextElement1.attributes[0].values[0].attrValue).toBeDefined();
    expect(queryResult.body.contextResponses[0].statusCode.code).toEqual(200);
    const ux = Date.parse('01 Jan 2019 00:00:00 GMT');

  })
  it('should not be possible to get more entries than confugured in MAX_RESULTS', async () => {
    const queryResult = await supertest(app)
      .get('/STH/v1/contextEntities/type/test_sensor/id/entity_2/attributes/temperature?lastN=1000')
      .set('Fiware-Service', tenant)
      .set('Fiware-ServicePath', '/')
      .send();
    expect(queryResult.status).toEqual(400);
  })
  it('should be possible to get the last 10 entries for multiple attributes', async () => {
    const queryResult = await supertest(app)
      .get('/STH/v1/contextEntities/type/test_sensor/id/entity_2/attributes/temperature,pm10,pm25?lastN=10')
      .set('Fiware-Service', tenant)
      .set('Fiware-ServicePath', '/')
      .send();
    expect(queryResult.status).toEqual(200);
    expect(queryResult.body.contextResponses).toHaveLength(1);
    const contextElement1 = queryResult.body.contextResponses[0].contextElement;
    expect(contextElement1.attributes).toHaveLength(3);
    expect(contextElement1.attributes[0].values).toHaveLength(10);
    expect(contextElement1.attributes[0].name).toEqual('temperature');
    expect(contextElement1.attributes[1].name).toEqual('pm10');
    expect(contextElement1.attributes[2].name).toEqual('pm25');
    expect(contextElement1.attributes[0].values[0].recvTime).toBeDefined();
    expect(contextElement1.attributes[0].values[0].attrValue).toBeDefined();
    expect(queryResult.body.contextResponses[0].statusCode.code).toEqual(200);
    const ux = Date.parse('01 Jan 2019 00:00:00 GMT');
  })
  it('should be possible to get the last 10 entries for multiple attributes including total number of records', async () => {
    const queryResult = await supertest(app)
      .get('/STH/v1/contextEntities/type/test_sensor/id/entity_2/attributes/temperature,pm10,pm25?lastN=10&count')
      .set('Fiware-Service', tenant)
      .set('Fiware-ServicePath', '/')
      .send();
    expect(queryResult.status).toEqual(200);
    expect(queryResult.body.contextResponses).toHaveLength(1);
    const contextElement1 = queryResult.body.contextResponses[0].contextElement;
    expect(contextElement1.attributes).toHaveLength(3);
    expect(contextElement1.attributes[0].values).toHaveLength(10);
    expect(contextElement1.attributes[0].name).toEqual('temperature');
    expect(contextElement1.attributes[1].name).toEqual('pm10');
    expect(contextElement1.attributes[2].name).toEqual('pm25');
    expect(contextElement1.attributes[0].values[0].recvTime).toBeDefined();
    expect(contextElement1.attributes[0].values[0].attrValue).toBeDefined();
    expect(queryResult.body.contextResponses[0].statusCode.code).toEqual(200);
    expect(contextElement1.count).toEqual(1000);
    const ux = Date.parse('01 Jan 2019 00:00:00 GMT');
  })
  it('should be possible to get the last 10 entries for multiple entities and multiple attributes', async () => {
    const queryResult = await supertest(app)
      .get('/STH/v1/contextEntities/type/test_sensor/id/entity_1,entity_2/attributes/temperature,pm10,pm25?lastN=10')
      .set('Fiware-Service', tenant)
      .set('Fiware-ServicePath', '/')
      .send();
    expect(queryResult.status).toEqual(200);
    expect(queryResult.body.contextResponses).toHaveLength(2);
    expect(queryResult.body.contextResponses[0].contextElement.id).toEqual('entity_1');
    expect(queryResult.body.contextResponses[1].contextElement.id).toEqual('entity_2');
    const contextElement1 = queryResult.body.contextResponses[0].contextElement;
    expect(contextElement1.attributes).toHaveLength(3);
    expect(contextElement1.attributes[0].values).toHaveLength(10);
    expect(contextElement1.attributes[0].name).toEqual('temperature');
    expect(contextElement1.attributes[1].name).toEqual('pm10');
    expect(contextElement1.attributes[2].name).toEqual('pm25');
    expect(contextElement1.attributes[0].values[0].recvTime).toBeDefined();
    expect(contextElement1.attributes[0].values[0].attrValue).toBeDefined();
    expect(queryResult.body.contextResponses[0].statusCode.code).toEqual(200);
    const ux = Date.parse('01 Jan 2019 00:00:00 GMT');
  })
  it('should be possible to get the last 10 entries for multiple entities and multiple attributes starting from a given date', async () => {
    const queryResult = await supertest(app)
      .get('/STH/v1/contextEntities/type/test_sensor/id/entity_1,entity_2/attributes/' +
        'temperature,pm10,pm25?lastN=10&dateFrom=2019-01-01T08:10:00.000Z')
      .set('Fiware-Service', tenant)
      .set('Fiware-ServicePath', '/')
      .send();
    expect(queryResult.status).toEqual(200);
    expect(queryResult.body.contextResponses).toHaveLength(2);
    expect(queryResult.body.contextResponses[0].contextElement.id).toEqual('entity_1');
    expect(queryResult.body.contextResponses[1].contextElement.id).toEqual('entity_2');
    const contextElement1 = queryResult.body.contextResponses[0].contextElement;
    expect(contextElement1.attributes).toHaveLength(3);
    expect(contextElement1.attributes[0].values).toHaveLength(10);
    expect(contextElement1.attributes[0].name).toEqual('temperature');
    expect(contextElement1.attributes[1].name).toEqual('pm10');
    expect(contextElement1.attributes[2].name).toEqual('pm25');
    expect(contextElement1.attributes[0].values[0].recvTime).toBeDefined();
    expect(contextElement1.attributes[0].values[0].recvTime).toEqual('2019-01-01T08:10:00.000Z');
    expect(contextElement1.attributes[0].values[9].recvTime).toEqual('2019-01-01T08:14:30.000Z');
    expect(contextElement1.attributes[0].values[0].attrValue).toBeDefined();
    expect(queryResult.body.contextResponses[0].statusCode.code).toEqual(200);
  })
  it('should be possible to get the last 10 entries for multiple entities and multiple attributes starting from a given date', async () => {
    const queryResult = await supertest(app)
      .get('/STH/v1/contextEntities/type/test_sensor/id/entity_1,entity_2/attributes/' +
        'temperature,pm10,pm25?lastN=10&dateTo=2019-01-01T08:00:00.000Z')
      .set('Fiware-Service', tenant)
      .set('Fiware-ServicePath', '/')
      .send();
    expect(queryResult.status).toEqual(200);
    expect(queryResult.body.contextResponses).toHaveLength(2);
    expect(queryResult.body.contextResponses[0].contextElement.id).toEqual('entity_1');
    expect(queryResult.body.contextResponses[1].contextElement.id).toEqual('entity_2');
    const contextElement1 = queryResult.body.contextResponses[0].contextElement;
    expect(contextElement1.attributes).toHaveLength(3);
    expect(contextElement1.attributes[0].values).toHaveLength(10);
    expect(contextElement1.attributes[0].name).toEqual('temperature');
    expect(contextElement1.attributes[1].name).toEqual('pm10');
    expect(contextElement1.attributes[2].name).toEqual('pm25');
    expect(contextElement1.attributes[0].values[0].recvTime).toBeDefined();
    expect(contextElement1.attributes[0].values[0].recvTime).toEqual('2019-01-01T08:00:00.000Z');
    expect(contextElement1.attributes[0].values[9].recvTime).toEqual('2019-01-01T07:55:30.000Z');
    expect(contextElement1.attributes[0].values[0].attrValue).toBeDefined();
    expect(queryResult.body.contextResponses[0].statusCode.code).toEqual(200);
  })
  it('should be possible to get the last 10 entries within a data range', async () => {
    const queryResult = await supertest(app)
      .get('/STH/v1/contextEntities/type/test_sensor/id/entity_1,entity_2/attributes/' +
        'temperature,pm10,pm25?lastN=10&dateTo=2019-01-01T08:00:00.000Z&dateFrom=2019-01-01T07:58:00.000Z')
      .set('Fiware-Service', tenant)
      .set('Fiware-ServicePath', '/')
      .send();
    expect(queryResult.status).toEqual(200);
    expect(queryResult.body.contextResponses).toHaveLength(2);
    expect(queryResult.body.contextResponses[0].contextElement.id).toEqual('entity_1');
    expect(queryResult.body.contextResponses[1].contextElement.id).toEqual('entity_2');
    const contextElement1 = queryResult.body.contextResponses[0].contextElement;
    expect(contextElement1.attributes).toHaveLength(3);
    expect(contextElement1.attributes[0].values).toHaveLength(5);
    expect(contextElement1.attributes[0].name).toEqual('temperature');
    expect(contextElement1.attributes[1].name).toEqual('pm10');
    expect(contextElement1.attributes[2].name).toEqual('pm25');
    expect(contextElement1.attributes[0].values[0].recvTime).toBeDefined();
    expect(contextElement1.attributes[0].values[0].recvTime).toEqual('2019-01-01T08:00:00.000Z');
    expect(contextElement1.attributes[0].values[4].recvTime).toEqual('2019-01-01T07:58:00.000Z');
    expect(contextElement1.attributes[0].values[0].attrValue).toBeDefined();
    expect(queryResult.body.contextResponses[0].statusCode.code).toEqual(200);
  })
  it('should be possible to paginate over entries', async () => {
    const queryResult = await supertest(app)
      .get('/STH/v1/contextEntities/type/test_sensor/id/entity_1,entity_2/attributes/' +
        'temperature,pm10,pm25?dateTo=2019-01-01T08:00:00.000Z&dateFrom=2019-01-01T02:00:00.000Z' +
        '&hLimit=20&hOffset=10')
      .set('Fiware-Service', tenant)
      .set('Fiware-ServicePath', '/')
      .send();
    expect(queryResult.status).toEqual(200);
    expect(queryResult.body.contextResponses).toHaveLength(2);
    expect(queryResult.body.contextResponses[0].contextElement.id).toEqual('entity_1');
    expect(queryResult.body.contextResponses[1].contextElement.id).toEqual('entity_2');
    const contextElement1 = queryResult.body.contextResponses[0].contextElement;
    expect(contextElement1.attributes).toHaveLength(3);
    expect(contextElement1.attributes[0].values).toHaveLength(20);
    expect(contextElement1.attributes[0].name).toEqual('temperature');
    expect(contextElement1.attributes[1].name).toEqual('pm10');
    expect(contextElement1.attributes[2].name).toEqual('pm25');
    expect(contextElement1.attributes[0].values[0].recvTime).toBeDefined();
    expect(contextElement1.attributes[0].values[0].recvTime).toEqual('2019-01-01T07:55:00.000Z');
    expect(contextElement1.attributes[0].values[19].recvTime).toEqual('2019-01-01T07:45:30.000Z');
    expect(contextElement1.attributes[0].values[0].attrValue).toBeDefined();
    expect(queryResult.body.contextResponses[0].statusCode.code).toEqual(200);
  })


});

describe('The Aggregate Query Mode', () => {

  it('should allow to make an aggregation query getting average values per hour', async () => {
    const avgQueryResult = await supertest(app)
      .get('/STH/v1/contextEntities/type/test_sensor/id/entity_1,entity_2/attributes/' +
        'temperature,pm10,pm25?dateFrom=2018-01-01T00:00:00.000Z&dateTo=2019-12-31T23:59:59.999Z' +
        '&aggrMethod=avg&aggrPeriod=hour')
      .set('Fiware-Service', tenant)
      .set('Fiware-ServicePath', '/')
      .send();
    // console.log(JSON.stringify(avgQueryResult.body));
    expect(avgQueryResult.status).toEqual(200);
    expect(avgQueryResult.body.contextResponses).toBeDefined();
    expect(avgQueryResult.body.contextResponses).toHaveLength(2);
    const ce1 = avgQueryResult.body.contextResponses[0];
    expect(ce1.contextElement.attributes).toHaveLength(3);
  });
  it('should allow to make an aggregation query getting average values per half hour', async () => {
    const avgQueryResult = await supertest(app)
      .get('/STH/v1/contextEntities/type/test_sensor/id/entity_1,entity_2/attributes/' +
        'temperature,pm10,pm25?dateFrom=2018-01-01T00:00:00.000Z&dateTo=2019-12-31T23:59:59.999Z' +
        '&aggrMethod=avg&aggrPeriod=halfhour')
      .set('Fiware-Service', tenant)
      .set('Fiware-ServicePath', '/')
      .send();
    // console.log(JSON.stringify(avgQueryResult.body));
    expect(avgQueryResult.status).toEqual(200);
    expect(avgQueryResult.body.contextResponses).toBeDefined();
    expect(avgQueryResult.body.contextResponses).toHaveLength(2);
    const ce1 = avgQueryResult.body.contextResponses[0];
    expect(ce1.contextElement.attributes).toHaveLength(3);
  });
  it('should allow to make an aggregation query getting average values per quarter hour', async () => {
    const avgQueryResult = await supertest(app)
      .get('/STH/v1/contextEntities/type/test_sensor/id/entity_1,entity_2/attributes/' +
        'temperature,pm10,pm25?dateFrom=2018-01-01T00:00:00.000Z&dateTo=2019-12-31T23:59:59.999Z' +
        '&aggrMethod=avg&aggrPeriod=quarterhour')
      .set('Fiware-Service', tenant)
      .set('Fiware-ServicePath', '/')
      .send();
    // console.log(JSON.stringify(avgQueryResult.body));
    expect(avgQueryResult.status).toEqual(200);
    expect(avgQueryResult.body.contextResponses).toBeDefined();
    expect(avgQueryResult.body.contextResponses).toHaveLength(2);
    const ce1 = avgQueryResult.body.contextResponses[0];
    expect(ce1.contextElement.attributes).toHaveLength(3);
  });
});


