/**
 * A router designed to work with Deno.serve()
 * **CAN THROW**
 * @example
 * import { Router } from "./router.ts";
 *
 * const router = new Router();
 *
 * router.get("/", ({ req, params }) => {
 *     return new Response("Example!");
 * });
 *
 * Deno.serve((req) => {
 *     return router.route(req);
 * });
 */
export class Router {
    #routes = new Map([
        ["GET", new Map()],
        ["POST", new Map()],
    ]);

    #add(method, pathname, handler) {
        if (typeof pathname !== "string" || pathname === "") {
            throw new Error("Invalid pathname");
        }

        this.#routes.get(method)?.set(pathname, handler);
    }

    /**
     * Register a function to handle GET requests at a given path
     * @example
     * router.get("/", ({ req, params }) => {
     *     return new Response("Example!");
     * });
     * @param {string} pathnames
     * @param {Function} handler
     */
    get(pathname, handler) {
        this.#add("GET", pathname, handler);
    }

    /**
     * Register a function to handle POST requests at a given path
     * @example
     * router.post("/", ({ req, params }) => {
     *     const body = await req.json();
     *     return new Response("Example!");
     * });
     * @param {string} pathname
     * @param {Function} handler
     */
    post(pathname, handler) {
        this.#add("POST", pathname, handler);
    }

    /**
     * Specify a path and a root directory to stream files from
     * @example
     * router.serve("/static", "static");
     * // a shorthand for the above
     * router.serve();
     * @param {string} pathname - will handle requests to this path
     * @param {string} foldername - will serve files from this root directory
     */
    static(pathname = "/static", foldername = "static") {
        this.#add("GET", `${pathname}/:path*`, async ({ params }) => {
            try {
                const file = await Deno.open(`./${foldername}/` + params.path, {
                    read: true,
                });

                const readableStream = file.readable;

                const headers = new Headers();

                // TODO add more types
                if (/\.js$/s.test(params.path)) {
                    headers.append("content-type", "text/javascript");
                }

                return new Response(readableStream, { headers });
            } catch (_error) {
                return new Response("Not Found", { status: 404 });
            }
        });
    }

    /**
     * Attach the router to Deno.serve()
     * @example
     * Deno.serve((req) => {
     *     return router.route(req);
     * });
     * @param {Request} req - Request passed from Deno.serve()
     * @returns {Response} Response
     */
    async route(req) {
        let status = 405;

        if (this.#routes.has(req.method)) {
            for (const [pathname, handler] of this.#routes.get(req.method)) {
                const url = new URLPattern({ pathname });
                if (url.test(req.url)) {
                    const params = url.exec(req.url)?.pathname.groups;
                    try {
                        return await handler({ req, params });
                    } catch (error) {
                        console.error(error);
                        status = 500;
                    }
                } else {
                    status = 404;
                }
            }
        }

        return new Response(null, { status });
    }
}

import {
    assertEquals,
    assertThrows,
} from "https://deno.land/std@0.172.0/testing/asserts.ts";

Deno.test("Router - invalid pathname throws", () => {
    const router = new Router();
    assertThrows(
        () => router.get("", () => new Response(null)),
        Error,
        "Invalid pathname",
    );
});

Deno.test("Router - get route with params works", async () => {
    const router = new Router();
    router.get("/test/:id", ({ params }) => {
        return new Response(`test, ${params.id}!`);
    });
    const response = await router.route(
        new Request("http://localhost/test/123"),
    );
    assertEquals(await response.text(), "test, 123!");
});

Deno.test("Router - post route with body works", async () => {
    const router = new Router();
    router.post("/test", async ({ req }) => {
        const body = await req.json();
        return new Response(`test, ${body.test}!`);
    });
    const response = await router.route(
        new Request("http://localhost/test", {
            method: "POST",
            body: JSON.stringify({ test: "TEST" }),
        }),
    );
    assertEquals(await response.text(), "test, TEST!");
});

Deno.test("Router - unknown method returns 405", async () => {
    const router = new Router();
    const response = await router.route(
        new Request("http://localhost/test", { method: "TEST" }),
    );
    assertEquals(response.status, 405);
});

Deno.test("Router - unknown route returns 404", async () => {
    const router = new Router();
    router.get("/test", () => new Response(null));
    const response = await router.route(
        new Request("http://localhost/bar"),
    );
    assertEquals(response.status, 404);
});

Deno.test("Router - server error returns 500", async () => {
    const router = new Router();
    router.get("/test", () => {
        throw new Error("TEST");
    });
    const response = await router.route(
        new Request("http://localhost/test"),
    );
    assertEquals(response.status, 500);
});