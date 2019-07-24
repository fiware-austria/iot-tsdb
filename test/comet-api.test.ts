import supertest from 'supertest';
import dotenv from 'dotenv';

dotenv.config({path: '.env.test'});
import mongoose from 'mongoose';
import {app} from '../server/app';


// import * as Bluebird from 'bluebird';
import {createUsers, range, saveUsers, getToken} from './helpers';
import User from '../server/models/user';



// (<any>mongoose).Promise = Bluebird;
mongoose.connect(process.env.MONGODB_URI, {useNewUrlParser: true});
const db = mongoose.connection;

const tenant = 'test_tenant';

const randomValue = (min: number, max: number) => Math.round((Math.random() * (max - min) + min) * 100) / 100
const delay = ms => new Promise(res => setTimeout(res, ms));

beforeAll(async () => await createTestEntries(3, 1000))
afterAll(async () => await mongoose.connection.collection(collectionName).deleteMany({}));

const random = (min: number, max: number) => Math.random() * (max - min) + min;
const collectionName = 'my_test_sensors';


const createTestEntries = async (numberOfSensors, numberOfSamples) => {
  const ux = Date.parse('01 Jan 2019 00:00:00 GMT');
  range(numberOfSensors).forEach(async sensor => {
    await mongoose.connection.collection(collectionName)
      .insertMany(range(numberOfSamples).map(nr => ({
        sensorId: `sensor_${sensor}`,
        timeStamp: new Date(ux + nr * 30000),
        'entity_type': 'test_sensor',
        'temperature': random(-20, 35),
        'humidity': random(0, 100),
        'airPressure': random(900, 1100),
        'mangOHTemp': random(-20, 35),
        'mangOHPress': random(900, 1100),
        'pm10': random(0, 70),
        'pm25': random(0, 70)
      })))
  })
}


describe('Simple Raw Comet Query', () => {
  it('should get us the latest 10 results', async () => {
    const queryResult = await supertest(app)
      .get('/STH/v1/contextEntities/type/test_sensor/id/sensor_2/attributes/temperature')
      .set('Fiware-Service', tenant)
      .set('Fiware-ServicePath', '/')
      .send();
    expect(queryResult.status).toEqual(200);
  })
});


/*
const createRequest = data =>
  supertest(app)
    .post(`/iot/d?i=${data.device_id}&k=${data.apiKey}`)
    // .set('Authorization', `Bearer ${getToken(savedUser[0])}`)
    .set('Fiware-Service', tenant)
    .set('Fiware-ServicePath', '/')
    .type('text')
    .send(data.payload);

const transmitSamples = (deviceGroups: [][]): Promise<any> =>
  deviceGroups.reduce((promise, group) =>
    promise.then(() => Promise.all(group.map(createRequest)).then(() => delay(100)) ), Promise.resolve())

describe('POST /api/iot/d', () => {
  it('should create a new Sensor samples (ONE_DOCUMENT_PER_VALUE)', async () => {
    // console.log(`Using token: ${userJWT}`);
    process.env.STORAGE_STRATEGY = 'ONE_DOCUMENT_PER_VALUE';
    const [groups, devices] = await Promise.all([storeGroups(1), storeDevices(1)]);
    const samples = createSensorValues(1, devices);
    const collectionName = tenant + '_' + process.env.STH_PREFIX + groups[0].apikey + '_' + devices[0].entity_type;
    await mongoose.connection.collection(collectionName).deleteMany({});
    const savedUser = await saveUsers(createUsers(1, 'sensor'));
    const sensorResponse = await supertest(app)
      .post(`/iot/d?i=${samples[0][0].device_id}&k=${groups[0].apikey}`)
      .set('Authorization', `Bearer ${getToken(savedUser[0])}`)
      .set('Fiware-Service', tenant)
      .set('Fiware-ServicePath', '/')
      .type('text')
      .send(samples[0][0].payload);
    expect(sensorResponse.status).toEqual(200);
    const storedValues = await mongoose.connection.collection(collectionName).find({'sensorId': devices[0].device_id}).toArray();
    expect(storedValues).toHaveLength(9);
    await delay(3000);
    const entities = await mongoose.connection.useDb('orion-' + tenant).collection('entities').find({}).toArray();
    expect(entities).toHaveLength(1);
    const entity = entities[0];
    await mongoose.connection.collection(collectionName).deleteMany({});

  });


  it('should create a new Sensor sample (ONE_DOCUMENT_PER_TRANSACTION)', async () => {
    // console.log(`Using token: ${userJWT}`);
    process.env.STORAGE_STRATEGY = 'ONE_DOCUMENT_PER_TRANSACTION';
    const [groups, devices] = await Promise.all([storeGroups(1), storeDevices(1)]);
    const samples = createSensorValues(1, devices);
    const collectionName = tenant + '_' + process.env.STH_PREFIX + groups[0].apikey + '_' + devices[0].entity_type;
    await mongoose.connection.collection(collectionName).deleteMany({});
    const savedUser = await saveUsers(createUsers(1, 'sensor'));
    const sensorResponse = await supertest(app)
      .post(`/iot/d?i=${samples[0][0].device_id}&k=${groups[0].apikey}`)
      .set('Authorization', `Bearer ${getToken(savedUser[0])}`)
      .set('Fiware-Service', tenant)
      .set('Fiware-ServicePath', '/')
      .type('text')
      .send(samples[0][0].payload);
    expect(sensorResponse.status).toEqual(200);
    const storedValues = await mongoose.connection.collection(collectionName).find({'sensorId': devices[0].device_id}).toArray();
    expect(storedValues).toHaveLength(1);
    const storedSample = storedValues[0];
    expect(storedSample.status).toEqual('ok');
    await delay(3000);
    const entities = await mongoose.connection.useDb('orion-' + tenant).collection('entities').find({}).toArray();
    expect(entities).toHaveLength(1);
    checkEntity(entities[0], storedValues[0]);
    await mongoose.connection.collection(collectionName).deleteMany({});
  });

  it('should throw an error if there is no corresponding device configuration', async () => {
    // console.log(`Using token: ${userJWT}`);
    process.env.STORAGE_STRATEGY = 'ONE_DOCUMENT_PER_TRANSACTION';
    const [groups, devices] = await Promise.all([storeGroups(1), storeDevices(1)]);
    const samples = createSensorValues(1, devices);
    const collectionName = tenant + '_' + process.env.STH_PREFIX + groups[0].apikey + '_' + devices[0].entity_type;
    await mongoose.connection.collection(collectionName).deleteMany({});
    const savedUser = await saveUsers(createUsers(1, 'sensor'));
    const sensorResponse = await supertest(app)
      .post(`/iot/d?i=not_configured&k=${groups[0].apikey}`)
      .set('Authorization', `Bearer ${getToken(savedUser[0])}`)
      .set('Fiware-Service', tenant)
      .set('Fiware-ServicePath', '/')
      .type('text')
      .send(samples[0][0].payload);
    expect(sensorResponse.status).toEqual(500);
    expect(sensorResponse.body).toEqual({message: 'There is no device configuration for device \'not_configured\''});
  });

  it('should throw an error if there is a payload with a property that is not configured', async () => {
    // console.log(`Using token: ${userJWT}`);
    process.env.STORAGE_STRATEGY = 'ONE_DOCUMENT_PER_TRANSACTION';
    const [groups, devices] = await Promise.all([storeGroups(1), storeDevices(1)]);
    const samples = createSensorValues(1, devices);
    const collectionName = tenant + '_' + process.env.STH_PREFIX + groups[0].apikey + '_' + devices[0].entity_type;
    await mongoose.connection.collection(collectionName).deleteMany({});
    const savedUser = await saveUsers(createUsers(1, 'sensor'));
    const sensorResponse = await supertest(app)
      .post(`/iot/d?i=${samples[0][0].device_id}&k=${groups[0].apikey}`)
      .set('Authorization', `Bearer ${getToken(savedUser[0])}`)
      .set('Fiware-Service', tenant)
      .set('Fiware-ServicePath', '/')
      .type('text')
      .send(samples[0][0].payload + '|nok|missing');
    expect(sensorResponse.status).toEqual(500);
  });




  it('should create multiple Sensor samples and transmit the latest value to ORION', async () => {
    jest.setTimeout(10000);
    // console.log(`Using token: ${userJWT}`);
    process.env.STORAGE_STRATEGY = 'ONE_DOCUMENT_PER_TRANSACTION';
    const numberOfDevices = 5;
    const numberOfSamples = 3;
    const [groups, devices] = await Promise.all([storeGroups(1), storeDevices(numberOfDevices)]);
    const samples = createSensorValues(numberOfSamples, devices);
    const collectionName = tenant + '_' + process.env.STH_PREFIX + groups[0].apikey + '_' + devices[0].entity_type;
    await mongoose.connection.collection(collectionName).deleteMany({});
    const savedUser = await saveUsers(createUsers(1, 'sensor'));
    const sensorResponses = await transmitSamples(samples);
    const storedValues = await mongoose.connection.collection(collectionName).find({}).sort({timestamp: -1}).toArray();
    expect(storedValues).toHaveLength(numberOfSamples * numberOfDevices);
    await delay(3000);
    const entities = await mongoose.connection.useDb('orion-' + tenant)
      .collection('entities').find({}).sort({'timestamp': -1}).toArray();
    expect(entities).toHaveLength(numberOfDevices);
    range(numberOfDevices).forEach( nr => {
        const lastSample = storedValues.find(s => s.sensorId === 'test_device_' + nr);
        const entity = entities.find(e => e._id.id === 'TestSensor' + nr);
        checkEntity(entity, lastSample);
      }
    );
    // repeat the test once more
    const samples2 = createSensorValues(numberOfSamples, devices);
    const sensorResponses2 = await transmitSamples(samples);
    const storedValues2 = await mongoose.connection.collection(collectionName).find({}).sort({timestamp: -1}).toArray();
    expect(storedValues2).toHaveLength(numberOfSamples * numberOfDevices * 2);
    await delay(3000);
    const entities2 = await mongoose.connection.useDb('orion-' + tenant)
      .collection('entities').find({}).sort({'timestamp': -1}).toArray();
    expect(entities).toHaveLength(numberOfDevices);
    range(numberOfDevices).forEach( nr => {
        const lastSample = storedValues2.find(s => s.sensorId === 'test_device_' + nr);
        const entity = entities2.find(e => e._id.id === 'TestSensor' + nr);
        checkEntity(entity, lastSample);
      }
    );
    await mongoose.connection.collection(collectionName).deleteMany({});
  });

});
*/
