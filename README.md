# Connect & Create

Create a brand new Flutter app called FINDMEET.



CRITICAL RULES:

1. NO fake accounts, NO demo users, NO seed data. App starts 100% empty.

2. Use Firebase Auth with Google Sign-In. First login = create profile.

3. Use Firebase: Auth, Firestore, Storage, Functions, FCM.

4. Use Material 3 + Flutter 3.22

5. DEFAULT TAB ON APP OPEN: Stories > Home



APP STRUCTURE:

Bottom Navigation with 5 tabs: [Chat] [Stories] [Create] [Jobs] [Profile]. Stories is selected by default.



---



1. CHAT TAB: WhatsApp Clone

   Top: Search Bar "Search for friends"

   SEARCH LOGIC: As user types, show live suggestions dropdown. Search users collection by username, displayName. Tap suggestion = open 1:1 chat instantly.

   Collections: users, chats, messages

   Features: 1:1 chat, group chat, send text, images, videos, voice notes, docs, stickers

   Features: Seen/Delivered ticks, Online/Last Seen, Typing indicator

   Features: Create Group, Group Admin, Delete for everyone, Block user, Mute chat

   UI: List of recent chats. Empty state: "No chats yet. Search to start"



2. STORIES TAB: TikTok Clone - THIS IS THE HOME SCREEN

   This tab has its OWN bottom bar with 4 buttons: [Home] [Explore] [Post] [Me]

   Home is selected by default inside this tab.



   A. HOME BUTTON - "For You Feed":

      Vertical full-screen scroll feed like TikTok. Autoplay video with sound on.

      Data from: posts collection

      Features: Like, Comment, Share, Follow button on profile pic, Save, Duet, Stitch

      Show: username, verified badge, caption, hashtags, music name + spinning record, likes count, comments count

      Swipe up for next video. Double tap to like.

      Empty state: "No videos yet. Follow people or post to see content"



   B. EXPLORE BUTTON - "Discover":

      Top: Search bar for users, hashtags, sounds

      Below: Trending hashtags, trending sounds, trending videos grid

      Data from: posts ordered by views/likes in last 7 days



   C. POST BUTTON - "+":

      Big center button like TikTok

      When tapped, show 2 options: CAMERA and UPLOAD

      UPLOAD has tabs [Videos] [Images] - Select up to 10

      EDITING SCREEN: Add Sound, Effects, Text, Stickers, Voiceover, Auto Captions

      POST SCREEN: Caption, Hashtags, @mentions, Settings

      Buttons: [Save to Drafts] [Post]

      On "Post": Saves to posts collection and appears in Home feed + Me profile grid instantly



   D. ME BUTTON - "Profile":

      Instagram Style Profile Page



3. CREATE TAB: AI Editor - CapCut + ChatGPT

   A. AI VIDEO EDITOR like CapCut: Trim, Cut, Speed, Text to Speech, Auto Captions, Templates, Export 4K

   B. AI GENERATOR: Text to Image and Text to Video with Gemini/Imagen API



4. JOBS TAB: LinkedIn Lite

   Collections: jobs, job_applications

   Top: "Post a Job" button for employers

   Below: Feed of jobs with search + filter by location, salary, type

   Tap Job → Apply: Upload CV/Resume to Storage + Cover Letter



5. PROFILE TAB: Instagram-Style Account



ONBOARDING - FIRST GOOGLE LOGIN:

   A. After Google Sign-In success, check if user document exists in "users" collection

   B. If NOT exists: Force user to "Complete Profile" screen before entering app. Cannot skip.

   C. COMPLETE PROFILE SCREEN - Instagram style:

      - Field 1: Profile Photo [Circle Avatar]. Tap to Upload from Gallery/Camera. Required.

      - Field 2: Full Name. Pre-filled from Google. Editable. Required.

      - Field 3: Username. Empty. User must type. Check uniqueness live in Firestore "users" collection. Show green check if available, red X if taken. Must be 3-20 chars, a-z, 0-9,. _ only. Required.

      - Field 4: Bio. Optional. Max 150 chars. Counter.

      - Field 5: Website. Optional.

      - Button: [Complete] - Disabled until Photo + Name + Unique Username are filled

      - On Complete: Create user document in Firestore and enter app



PROFILE TAB UI:

   Top Section:

   - Row 1: Username with verified badge if applicable. [Settings Gear Icon] right

   - Row 2: [Circle Profile Photo 90px] [Posts Count] [Followers Count] [Following Count]

   - Row 3: Display Name in bold

   - Row 4: Bio. Multi-line. @mentions and #hashtags clickable

   - Row 5: Website link. Clickable

   - Row 6: [Edit Profile Button] [Share Profile Button]



   EDIT PROFILE SCREEN - Instagram style:

   - Top AppBar: [Cancel] "Edit Profile" [Done]

   - List: Change Photo, Name, Username with live check, Website, Bio 150 chars, Social Links

   - On [Done]: Update Firestore "users" document + Storage for new photo



   Content Grid Section:

   - Tab Bar: [Posts Grid Icon] [Videos Grid Icon] [Saved Icon - only visible to self] [Tagged Icon]

   - POSTS TAB: Grid 3x3 of all images user posted

   - VIDEOS TAB: Grid 3x3 of all videos user posted

   - SAVED TAB: Grid of posts user saved. Only visible to profile owner

   - TAGGED TAB: Posts where user is @mentioned



   SETTINGS SCREEN - From Gear Icon:

   - Account, Privacy, Notifications, Blocked Users, [Logout] [Delete Account]



STORAGE:

   - Profile Photos: storage/posts/profiles/{userId}.jpg



FIRESTORE USERS COLLECTION:

   users/{uid}: {uid, username: lowercase unique, displayName, photoURL, bio, website, socialLinks, followersCount, followingCount, postsCount, likesCount, createdAt, fcmToken}



DATABASE RULES:

- All reads/writes require auth

- Username must be unique. Use Cloud Function to check and reserve on create

- User can only edit/delete their own content

- Storage: public read for posts, private write



IMPORTANT: Build all screens with empty states. Do not create any test data.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://findmit.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/217845d1-1902-4fde-8be3-c4cf5f7ae702).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
