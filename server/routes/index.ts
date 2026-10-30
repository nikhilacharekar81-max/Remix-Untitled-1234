import { Router } from 'express';
import { verifyAuthTokenMiddleware } from '../middleware/auth.js';
import { authRouter } from './authRoutes.js';
import { userRouter } from './userRoutes.js';
import { gigRouter } from './gigRoutes.js';
import { projectRouter } from './projectRoutes.js';
import { proposalRouter } from './proposalRoutes.js';
import orderRouter from './orderRoutes.js';
import workstreamRouter from './workstreamRoutes.js';
import financialRouter from './financialRoutes.js';
import reviewRouter from './reviewRoutes.js';
import notificationRouter from './notificationRoutes.js';
import adminRouter from './adminRoutes.js';

export const apiRouter = Router();
apiRouter.use(verifyAuthTokenMiddleware);

apiRouter.use('/auth', authRouter);
apiRouter.use(userRouter);
apiRouter.use(gigRouter);
apiRouter.use(projectRouter);
apiRouter.use(proposalRouter);
apiRouter.use(orderRouter);
apiRouter.use(workstreamRouter);
apiRouter.use(financialRouter);
apiRouter.use(reviewRouter);
apiRouter.use(notificationRouter);
apiRouter.use(adminRouter);

export default apiRouter;
