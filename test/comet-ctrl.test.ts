import CometCtrl from '../server/controllers/comet';

const cometCtrl = new CometCtrl();
const dateFrom = new Date(Date.parse('2019-01-01T00:00:00.000Z'));
const dateTo = new Date(Date.parse('2019-11-31T23:59:59.999Z'));
const attributes = ['temperature', 'pm10', 'pm25'];
const entity = 'Room42';

describe('Comet Controller Aggregation Functionality', () => {
  /*
  it('should create an average by year query', () => {

    const query = cometCtrl.aggregateQuery(entity, attributes, 'avg', 'year', dateFrom, dateTo);
    const projection = query[0];
    const match = query[1];
    expect(match.$match.$and).toHaveLength(3);
    expect(match.$match.$and).toContainEqual({entity_name: entity});
    // console.log(JSON.stringify(query));
  });
  it('should create an average by hour query', () => {

    const query = cometCtrl.aggregateQuery(entity, attributes, 'avg', 'hour', dateFrom, dateTo);
   // console.log(JSON.stringify(query));
  });
  it('should create an average by half hour query', () => {
    const query = cometCtrl.aggregateQuery(entity, attributes, 'avg', 'half_hour', dateFrom, dateTo);
    console.log(JSON.stringify(query));
  });
   */
});
