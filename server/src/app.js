import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import routes from './routes.js';

export const app = express();

app.set('trust proxy', true);
app.use(helmet());
app.use(cors({ origin: env.clientOrigin }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

app.use('/api/v1', routes);

app.use(notFoundHandler);
app.use(errorHandler);
