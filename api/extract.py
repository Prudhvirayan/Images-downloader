"""
yt-dlp extraction endpoint.
Supports YouTube, TikTok, Instagram, Twitter/X, Vimeo, Dailymotion, Facebook, Reddit, and 1000+ more.

Query params:
  url        - required
  mode       - 'info' | 'video' (default) | 'audio'
  quality    - video: height in px e.g. '1080', '720', or 'best'
  audio_fmt  - audio: 'm4a' | 'webm' | 'best'
"""

from http.server import BaseHTTPRequestHandler
import json
import urllib.parse

VIDEO_FORMAT = {
    'best':  'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best[ext=mp4]/best',
    '2160':  'bestvideo[height<=2160][ext=mp4]+bestaudio[ext=m4a]/best[height<=2160]/best',
    '1440':  'bestvideo[height<=1440][ext=mp4]+bestaudio[ext=m4a]/best[height<=1440]/best',
    '1080':  'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080]/best',
    '720':   'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720]/best',
    '480':   'bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480]/best',
    '360':   'bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/best[height<=360]/best',
}

AUDIO_FORMAT = {
    'm4a':  'bestaudio[ext=m4a]/bestaudio[acodec^=aac]/bestaudio',
    'webm': 'bestaudio[ext=webm]/bestaudio[acodec=opus]/bestaudio',
    'best': 'bestaudio/best',
}

def _quality_label(h):
    if h >= 2160: return '4K'
    if h >= 1440: return '2K'
    if h >= 1080: return 'FHD'
    if h >= 720:  return 'HD'
    return f'{h}p'


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        params    = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        url       = params.get('url',       [''])[0]
        mode      = params.get('mode',      ['video'])[0]
        quality   = params.get('quality',   ['best'])[0]
        afmt      = params.get('audio_fmt', ['m4a'])[0]

        if not url:
            return self._json(400, {'error': 'url parameter required'})

        try:
            import yt_dlp

            base_opts = {
                'quiet': True, 'no_warnings': True,
                'noplaylist': True, 'skip_download': True,
            }

            # ── INFO MODE ─────────────────────────────────────────────────────
            # Returns available quality options — no stream URLs, fast.
            if mode == 'info':
                with yt_dlp.YoutubeDL(base_opts) as ydl:
                    info = ydl.extract_info(url, download=False)

                if not info:
                    return self._json(404, {'error': 'No media found'})

                formats = info.get('formats', [])

                # Collect distinct video heights
                seen_h = set()
                video_fmts = []
                for f in sorted(formats, key=lambda x: x.get('height') or 0, reverse=True):
                    h = f.get('height')
                    if h and h not in seen_h and f.get('vcodec', 'none') != 'none':
                        seen_h.add(h)
                        video_fmts.append({
                            'key':    str(h),
                            'label':  f'{_quality_label(h)} · {h}p',
                            'height': h,
                        })

                # Fallback if no height info (TikTok, Instagram, etc.)
                if not video_fmts:
                    video_fmts = [{'key': 'best', 'label': 'Best', 'height': 0}]

                # Audio formats present
                has_m4a  = any(f.get('ext') == 'm4a'  and f.get('vcodec','none') == 'none' for f in formats)
                has_webm = any(f.get('ext') == 'webm' and f.get('vcodec','none') == 'none' for f in formats)
                audio_fmts = []
                if has_m4a:  audio_fmts.append({'key': 'm4a',  'label': 'M4A · AAC'})
                if has_webm: audio_fmts.append({'key': 'webm', 'label': 'WebM · Opus'})
                if not audio_fmts: audio_fmts.append({'key': 'best', 'label': 'Best audio'})

                return self._json(200, {
                    'title':         info.get('title'),
                    'thumbnail':     info.get('thumbnail'),
                    'uploader':      info.get('uploader') or info.get('channel'),
                    'duration':      info.get('duration'),
                    'platform':      info.get('extractor_key', '').lower(),
                    'video_formats': video_fmts[:6],
                    'audio_formats': audio_fmts,
                })

            # ── DOWNLOAD MODE ─────────────────────────────────────────────────
            fmt = AUDIO_FORMAT.get(afmt, AUDIO_FORMAT['m4a']) if mode == 'audio' \
                  else VIDEO_FORMAT.get(quality, VIDEO_FORMAT['best'])

            with yt_dlp.YoutubeDL({**base_opts, 'format': fmt}) as ydl:
                info = ydl.extract_info(url, download=False)

            if not info:
                return self._json(404, {'error': 'No media found'})

            formats = info.get('formats', [])
            chosen  = None
            if formats:
                if mode == 'audio':
                    ao = [f for f in formats if f.get('vcodec','none') == 'none' and f.get('acodec','none') != 'none']
                    pref = [f for f in ao if f.get('ext') == afmt]
                    chosen = pref[-1] if pref else (ao[-1] if ao else formats[-1])
                else:
                    h_cap = int(quality) if quality.isdigit() else None
                    comb = [
                        f for f in formats
                        if f.get('ext') == 'mp4'
                        and f.get('vcodec','none') != 'none'
                        and f.get('acodec','none') != 'none'
                        and (h_cap is None or (f.get('height') or 0) <= h_cap)
                    ]
                    if comb:
                        chosen = sorted(comb, key=lambda f: f.get('height') or 0)[-1]
                    else:
                        capped = [f for f in formats if h_cap is None or (f.get('height') or 0) <= h_cap]
                        chosen = capped[-1] if capped else formats[-1]

            stream_url = (chosen or info).get('url') or info.get('url')
            if not stream_url:
                return self._json(404, {'error': 'Could not extract stream URL'})

            return self._json(200, {
                'url':      stream_url,
                'title':    info.get('title') or 'video',
                'ext':      (chosen or info).get('ext') or ('m4a' if mode == 'audio' else 'mp4'),
                'height':   (chosen or info).get('height'),
                'filesize': (chosen or info).get('filesize') or (chosen or info).get('filesize_approx'),
                'thumbnail':info.get('thumbnail'),
                'duration': info.get('duration'),
                'uploader': info.get('uploader') or info.get('channel'),
                'platform': info.get('extractor_key', '').lower(),
                'http_headers': (chosen or info).get('http_headers') or {},
            })

        except Exception as e:
            msg = str(e)
            if 'Sign in' in msg or 'login' in msg.lower():
                msg = 'This content requires login — private or age-restricted.'
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
