FROM node:12.5.0-alpine

WORKDIR /tsdb

COPY server ./server
COPY package*.json preprocessor.js tsconfig.json tslint.json ./
COPY .env ./.env

RUN npm install && npm run predev

ENTRYPOINT ["node", "dist/server/server.js"]
