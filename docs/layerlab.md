# LayerLab: a classroom for layerling

LayerLab adds a classroom to layerling, in the spirit of Tinkercad Classrooms:

- **Classes.** The teacher creates a class and gets a six-letter join code.
- **Students join** at `/layerlab` with the code, their name and a PIN they choose. No email or account is needed.
- **Work is saved for the class.** A student designs in the normal editor. Their designs are saved in a server folder of their own, and new designs start there automatically.
- **Teacher review.** For every student, the teacher sees each design with its latest picture. They can open a copy in the editor and leave comments that the student sees. Students can reply.
- **Iterations.** A version of a design is kept every few minutes while a student works, with a picture of each one. The teacher can step through the versions, open any of them, and attach a comment to a specific version. This shows how a design grew, which helps confirm the work is the student's own. When a design began from a starter, its history says so.
- **Tutorials and starters.** The teacher writes tutorials with text, an optional video or web link and an optional starter design. A starter is a `.lyl` file saved from layerling. Each student who starts from it gets their own copy.

## Running it

LayerLab needs the Node server build (Docker or `npm start`). Static hosting with `store.php` is not enough, because classes, iterations and comments are kept by the server.

Two settings switch it on:

| Setting | What it does |
| --- | --- |
| `LAYERLING_SHARED_PROJECTS_DIR` | The folder on the server for every design. LayerLab keeps its own data in `.layerlab/` inside it, and each student's designs in `.users/layerlab-<class>-<student>/`. Back this folder up. |
| `LAYERLAB_TEACHER_PASSWORD` | The teacher's password. Without it, LayerLab is off and the LayerLab button is hidden. |
| `LAYERLAB_SECRET` (recommended) | A long random string that signs the sign-in cookies. If it is not set, the password is used, so changing the password signs everyone out. |

### With Docker (recommended)

```sh
git clone https://github.com/<you>/layerling.git
cd layerling
cat > docker/.env <<'ENV'
LAYERLAB_TEACHER_PASSWORD=choose-a-strong-password
LAYERLAB_SECRET=paste-a-long-random-string-here
ENV
docker compose -f docker/compose.layerlab.yml --env-file docker/.env up -d --build
```

Open `http://<server>:3000/layerlab`. Use **Teacher** to sign in, then create a class.

To make it reachable for students at school or at home, put the server behind HTTPS with a domain name. Options include:

- **A small VPS** (any provider with 1 to 2 GB RAM) running the compose file, with [Caddy](https://caddyserver.com/) in front for automatic HTTPS: `reverse_proxy localhost:3000`.
- **A container host with a persistent disk**, such as Railway, Render or Fly.io. Build from `docker/Dockerfile`, set the settings above as environment variables, set `LAYERLING_SHARED_PROJECTS_DIR` to a folder on the attached volume, and expose port 3000.
- **A school server or NAS** that already runs Docker.

If a proxy rewrites the host and saving is refused, add the public address to `LAYERLING_ALLOWED_ORIGINS`.

### Without Docker

```sh
npm ci
LAYERLING_SHARED_PROJECTS_DIR=/srv/layerlab LAYERLAB_TEACHER_PASSWORD=... LAYERLAB_SECRET=... npm run build
LAYERLING_SHARED_PROJECTS_DIR=/srv/layerlab LAYERLAB_TEACHER_PASSWORD=... LAYERLAB_SECRET=... npm start
```

## Who can reach what

The site itself is public: anyone with the address can open the editor. With LayerLab switched on, the server folder is for signed-in people only. Students see their own folder, the teacher sees the main one, and a visitor who has not signed in saves to their own browser, as on layerling.com. Only someone with a class code can join a class, and only the teacher password opens the teacher area.

## Using it

**Teacher.** Go to `/layerlab` and sign in. Create a class and give students its code. The *Students and work* tab lists each student's designs. Click one to see its versions and comments. In the *Tutorials and starters* tab, upload starters (save a design in layerling with *Save as file* and upload the `.lyl`) and write tutorials. You can also reset a student's PIN or make a new join code.

**Student.** Go to `/layerlab`, type the class code, your name and a PIN. *My work* shows your designs and your teacher's comments. *New design* or *Start from the starter* opens the editor. Everything you save goes to your class folder.

## Limits of this first version

- There is one teacher password per server, not separate teacher accounts.
- Students can see their teacher's comments on the LayerLab page, but not yet inside the editor.
- The LayerLab page is in English only. The editor keeps all its languages.
- A student's session is a signed cookie. Removing a student from a class stops them from appearing, but a browser that is already signed in can still save into that student's folder until it signs out.
- Data is kept as files and written by one server process, so run a single container.

## Keeping up with layerling

LayerLab is written to sit on top of upstream layerling with very few changes to its files:

- New files: `apps/web/src/lib/layerlab/`, `apps/web/src/app/layerlab/`, `apps/web/src/app/api/layerlab/`, `apps/web/src/components/layerlab/`, `docker/compose.layerlab.yml`, this file, and `tests/unit/layerlab.test.ts`.
- Small hooks in existing files:
  - `app/api/shared-projects/route.ts`: the student's folder, and recording iterations after a save, rename or move.
  - `app/api/server-defaults/route.ts`: new designs start on the server for students.
  - `app/page.tsx`: the LayerLab button and opening a design from a LayerLab link.

To pull in a new layerling release from your fork:

```sh
git remote add upstream https://github.com/henmedia/layerling.git   # once
git fetch upstream
git merge upstream/main
npm ci && npm run ci
```

You can also use **Sync fork** on GitHub. A conflict, if one happens, will be in one of the hook lines above. Keep both sides.
