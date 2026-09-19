import { setupServer } from "msw/node";

import { communesHandlers, handlers } from "./handlers";

export const server = setupServer(...handlers, ...communesHandlers);
