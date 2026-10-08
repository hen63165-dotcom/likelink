// Forward /api/* to the LikeLink API (see edge/pagesProxy.mjs).
import { proxyToApi } from "../../edge/pagesProxy.mjs";

export const onRequest = (context) => proxyToApi(context);
