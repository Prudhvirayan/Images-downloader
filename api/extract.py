"""
yt-dlp extraction endpoint — returns direct stream URL without downloading.
Supports YouTube, TikTok, Instagram, Twitter/X, Vimeo, Dailymotion, Facebook, Reddit, and 1000+ more.

Query params:
  url        - required - URL to extract from
  mode       - 'video' (default) | 'audio'
  quality    - video only: 'best' (default) | '2k' | '1080p' | '720p' | '480p'
  audio_fmt  - audio only: 'm4a' (default) | 'webm' | 'best'
"""

from http.server import BaseHTTPRequestHandler
import json
import urllib.parse

# yt-dlp format strings per video quality
VIDEO_FORMAT = {
    'best':  'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best[ext=mp4]/best',
    '2k':    'bestvideo[height<=1440][ext=mp4]+bestaudio[ext=m4a]/best[height<=1440][ext=mp4]/best[height<=1440]/best',
    '1080p': 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best[height<=1080]/best',
    '720p':  'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best[height<=720]/best',
    '480p':  'bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480][ext=mp4]/best[height<=480]/best',
}

# yt-dlp format strings per audio format
AUDIO_FORMAT = {
    'm4a':  'bestaudio[ext=m4a]/bestaudio[acodec^=aac]/bestaudio',
    'webm': 'bestaudio[ext=webm]/bestaudio[acodec=opus]/bestaudio',
    'best': 'bestaudio/best',
}


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        params  = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        url     = params.get('url',       [''])[0]
        mode    = params.get('mode',      ['video'])[0]   # 'video' | 'audio'
        quality = params.get('quality',   ['best'])[0]    # 'best' | '2k' | '1080p' | '720p' | '480p'
        afmt    = params.get('audio_fmt', ['m4a'])[0]     # 'm4a' | 'webm' | 'best'

        if not url:
            return self._json(400, {'error': 'url parameter required'})

        try:
            import yt_dlp

            fmt = AUDIO_FORMAT.get(afmt, AUDIO_FORMAT['m4a']) if mode == 'audio' \
                  else VIDEO_FORMAT.get(quality, VIDEO_FORMAT['best'])

            ydl_opts = {
                'quiet':       True,
                'no_warnings': True,
                'noplaylist':  True,
                'format':      fmt,
                'skip_download': True,
            }

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)

            if not info:
                return self._json(404, {'error': 'No media found at this URL'})

            formats = info.get('formats', [])
            chosen  = None

            if formats:
                if mode == 'audio':
                    # Pick best audio-only format
                    audio_only = [f for f in formats if f.get('vcodec', 'none') == 'none' and f.get('acodec', 'none') != 'none']
                    if afmt == 'm4a':
                        preferred = [f for f in audio_only if f.get('ext') == 'm4a']
                        chosen = preferred[-1] if preferred else (audio_only[-1] if audio_only else formats[-1])
                    elif afmt == 'webm':
                        preferred = [f for f in audio_only if f.get('ext') == 'webm']
                        chosen = preferred[-1] if preferred else (audio_only[-1] if audio_only else formats[-1])
                    else:
                        chosen = audio_only[-1] if audio_only else formats[-1]
                else:
                    # Pick best video+audio combined mp4 within the requested height
                    height_cap = {'2k': 1440, '1080p': 1080, '720p': 720, '480p': 480}.get(quality)
                    combined = [
                        f for f in formats
                        if f.get('ext') == 'mp4'
                        and f.get('vcodec', 'none') != 'none'
                        and f.get('acodec', 'none') != 'none'
                        and (height_cap is None or (f.get('height') or 0) <= height_cap)
                    ]
                    if combined:
                        chosen = sorted(combined, key=lambda f: f.get('height') or 0)[-1]
                    else:
                        # Fallback: any format within height cap
                        capped = [f for f in formats if height_cap is None or (f.get('height') or 0) <= height_cap]
                        chosen = capped[-1] if capped else formats[-1]

            stream_url = (chosen or info).get('url') or info.get('url')
            if not stream_url:
                return self._json(404, {'error': 'Could not extract a direct stream URL'})

            actual_ext = (chosen or info).get('ext') or ('m4a' if mode == 'audio' else 'mp4')
            actual_h   = (chosen or info).get('height')

            return self._json(200, {
                'url':      stream_url,
                'title':    info.get('title') or 'video',
                'ext':      actual_ext,
                'height':   actual_h,
                'filesize': (chosen or info).get('filesize') or (chosen or info).get('filesize_approx'),
                'thumbnail':info.get('thumbnail'),
                'duration': info.get('duration'),
                'uploader': info.get('uploader') or info.get('channel'),
                'platform': info.get('extractor_key', 'unknown').lower(),
                'http_headers': (chosen or info).get('http_headers') or {},
            })

        except Exception as e:
            msg = str(e)
            if 'Sign in' in msg or 'login' in msg.lower():
                msg = 'This content requires a login — private or age-restricted.'
            elif 'Unsupported URL' in msg:
                msg = 'Platform not supported by yt-dlp.'
            elif 'HTTP Error 403' in msg:
                msg = 'Access denied by the platform (403).'
            return self._json(500, {'error': msg})

    def _json(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_):
        pass
