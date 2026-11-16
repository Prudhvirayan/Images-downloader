"""Adapt the Vercel extraction handler for requests from the local Express server."""

import io
import json
import sys

from extract import handler


class LocalResponse(handler):
    def __init__(self, path):
        self.path = path
        self.status = 200
        self.wfile = io.BytesIO()

    def send_response(self, status):
        self.status = status

    def send_header(self, _name, _value):
        pass

    def end_headers(self):
        pass


if __name__ == '__main__':
    response = LocalResponse(sys.argv[1])
    handler.do_GET(response)
    print(json.dumps({
        'status': response.status,
        'body': response.wfile.getvalue().decode('utf-8'),
    }))
