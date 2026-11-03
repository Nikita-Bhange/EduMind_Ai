# EduMind AI

EduMind AI is a study companion for students. It combines document-based learning tools with AI-assisted revision workflows.

## Current application

- **Frontend:** React 19, Vite, React Router, Tailwind/CSS, and Axios
- **Backend:** Node.js, Express, MongoDB/Mongoose, JWT authentication, file uploads, and Google Gemini integration
- **Learning flows:** authentication, document management, flashcards, quizzes, profile, and dashboard views

The source in this repository is being prepared as the rebuild contribution for [Iqra403/Edumind-AI](https://github.com/Iqra403/Edumind-AI), based on the original [Nikita-Bhange/EduMind_Ai](https://github.com/Nikita-Bhange/EduMind_Ai) project.

## Repository layout

```
Backend/    Express API and MongoDB models
Frontend/   React/Vite client
```

## Local setup

### Backend

1. `cd Backend`
2. `npm install`
3. Copy `.env.example` to `.env` and set the values.
4. Start the API with `npm run dev`.

The API defaults to port `8000`.

### Frontend

1. `cd Frontend`
2. `npm install`
3. Start Vite with `npm run dev`.

Set the frontend API base URL according to the client configuration and the backend URL you are running locally.

## Environment variables

Never commit real credentials. See [Backend/.env.example](Backend/.env.example) for the required variable names:

- `PORT`
- `MONGODB_URI`
- `JWT_SECRET`
- `JWT_EXPIRE`
- `GEMINI_API_KEY`
- `FRONTEND_URL`

## Contribution notes

This branch adds project documentation and safe configuration defaults while preserving the existing application source. Before deployment, run the frontend build and backend checks with real environment values in a local or CI environment.
