import http from 'node:http';
import { app } from './app.js';
import { env } from './config/env.js';
import { initSockets } from './sockets/index.js';

const server = http.createServer(app);
export const io = initSockets(server);

server.listen(env.port, () => {
  console.log(`EduConnect API running on http://localhost:${env.port}/api/v1`);
});
