# LayerLab with Google sign-in and Google Classroom

This guide is for the teacher who runs LayerLab. It takes about 20 minutes, and you only do it once.

There are two parts:

1. **Share to Google Classroom** works right away, with no setup. Students press **Turn in on Google Classroom** on a design, and you press **Assign in Classroom** on a tutorial.
2. **Sign in with Google** lets students and you log in with school Google accounts instead of a PIN or password. It needs the setup below.

---

## Part 1: Share to Google Classroom (no setup)

**You, the teacher**

- **Post the join link.** Open a class in LayerLab and press **Post the join link in Google Classroom**. Google Classroom opens. Pick the class and post it as Material. Students click the link and the class code is already filled in.
- **Assign a tutorial.** In **Tutorials and starters**, press **Assign in Classroom** next to a tutorial. Pick the class, set a due date and post it as an Assignment. The link opens LayerLab on that tutorial.
- **Grade.** When a student turns in, their Classroom submission has a link. Click it. LayerLab opens that design with its full version history and the comment thread. (Sign in as the teacher first if it asks.)

**Students**

1. Open your design in LayerLab (**My work**, then click the design).
2. Press **Turn in on Google Classroom**.
3. In the Classroom window, pick your class, choose **Turn in** on the assignment, pick the assignment and press **Go**, then **Turn in**.

Students must be signed in to their school Google account in the browser, which they normally are on a Chromebook.

---

## Part 2: Sign in with Google (one-time setup)

You will make a "sign-in key" in Google Cloud, then paste it into Railway.

### Step 1: Create a Google Cloud project

1. Go to **https://console.cloud.google.com** and sign in with your **school** Google account.
2. If Google asks you to accept terms, accept them.
3. At the top left, click the project picker (it may say **Select a project**), then **New project**.
4. Name it `LayerLab` and press **Create**. Wait a few seconds, then make sure **LayerLab** is selected at the top.

If your school account is not allowed to create projects, ask your IT department to create one for you, or use the same steps with a personal Google account (then choose **External** in Step 2).

### Step 2: Set up the sign-in screen

1. In the search bar at the top, type **Google Auth Platform** and open it. (In older screens this is **APIs & Services > OAuth consent screen**.)
2. Press **Get started**.
3. **App name:** `LayerLab`. **User support email:** your email. Press **Next**.
4. **Audience:** choose **Internal** if you see it. That means only accounts from your school can sign in. If only **External** is offered, choose it. Press **Next**.
5. **Contact information:** your email. Press **Next**, tick the agreement, and press **Create**.
6. If you chose **External**: open **Audience** on the left and press **Publish app**, then **Confirm**. LayerLab only asks for name and email, so Google does not need to review it.

### Step 3: Create the sign-in key

1. On the left, open **Clients**, then press **Create client**.
2. **Application type:** **Web application**. **Name:** `LayerLab`.
3. Under **Authorized redirect URIs**, press **Add URI** and paste exactly:

   ```
   https://layerling-production.up.railway.app/api/layerlab/google
   ```

   (If you move LayerLab to another web address later, add that address with `/api/layerlab/google` at the end.)
4. Press **Create**.
5. A window shows a **Client ID** and a **Client secret**. Copy both somewhere safe for the next step. Treat the secret like a password.

### Step 4: Paste the key into Railway

1. Go to **https://railway.app**, open your LayerLab project, and click the **layerling** service.
2. Open the **Variables** tab.
3. Press **New Variable** and add each of these (name on the left, value on the right):

   | Name | Value |
   | --- | --- |
   | `LAYERLAB_GOOGLE_CLIENT_ID` | the Client ID from Step 3 |
   | `LAYERLAB_GOOGLE_CLIENT_SECRET` | the Client secret from Step 3 |
   | `LAYERLAB_GOOGLE_DOMAINS` | your school's email domain, for example `myschool.org`. Only accounts from it can sign in as students. |
   | `LAYERLAB_TEACHER_EMAILS` | your school email. Signing in with it makes you the teacher. Add a co-teacher with a comma: `me@myschool.org, them@myschool.org` |

4. Railway shows a bar about changes waiting. Press **Deploy** (or **Apply changes**). Wait until the deploy shows **Active**, a couple of minutes.

### Step 5: Ask IT to trust LayerLab (students under 18)

Google blocks students under 18 from signing in to apps the school has not approved. Send your IT administrator this:

> Please mark our classroom app LayerLab as **Trusted** for students. In the Google Admin console: Security > Access and data control > API controls > Manage Third-Party App Access > Configure new app. Search by OAuth client ID: `<paste your Client ID>`. Choose the student organizational unit and set access to **Trusted**. It only asks for name and email (openid, email, profile).

Until IT does this, students can still join with the class code and a PIN, and Share to Classroom works either way.

### Step 6: Try it

1. Open **https://layerling-production.up.railway.app/layerlab** in a private window.
2. Press **Teacher sign in with Google** and pick your school account. You should land on your classes.
3. Students press **Sign in with Google**. The first time, they type the class code (or click your join link from Classroom, which fills it in). After that, Google signs them straight in.

---

## Good to know

- **Students who already joined with a PIN** keep all their work. When they first sign in with Google and type the class code, LayerLab asks for their PIN once to link the two. Their PIN keeps working too.
- **Two students with the same first name** are told apart by their last initial, such as "Sam K.".
- **What LayerLab keeps:** the student's first name and a scrambled number for their Google account. It does not store email addresses or anything from Classroom or Drive.
- **The teacher password still works**, so you can always get in even if Google sign-in has a problem.
- **If sign-in says "redirect_uri_mismatch"**, the address in Step 3 does not match exactly. Check for a missing `https://`, a typo, or a slash at the end.
- **If the site address shown by Google is wrong** (rare, behind some proxies), add a Railway variable `LAYERLAB_PUBLIC_URL` = `https://layerling-production.up.railway.app`.
