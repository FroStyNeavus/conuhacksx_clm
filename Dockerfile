FROM node:22-alpine

WORKDIR /src

COPY package*.json ./

RUN npm install

COPY start_server.js .

COPY web ./web

ENV PORT=9000
EXPOSE 9000

CMD ["npm", "start"]