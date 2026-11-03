import express, { urlencoded } from "express";
import connectDB from "./config/db.js"
import errorHandler from "./middleware/errorHandler.js"
import authRoutes from './routes/authRoutes.js'
import documentRoutes from './routes/documentRoutes.js'
import flashcardRoutes from './routes/flashcardRoutes.js'
import quizRoutes from './routes/quizRoutes.js'
import aiRoutes from './routes/aiRoutes.js'
import progressRoutes from './routes/progressRoutes.js'
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from "url";
import dotenv from 'dotenv';
dotenv.config();


//ES6 module __dirname alternative
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

//Initailize express app
const app = express();
 //connect ro mongodb
 connectDB()
 
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "https://edu-mind-ai-psi.vercel.app",
    methods: ["GET", "PUT", "POST", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

 app.use(express.json())
 app.use(express.urlencoded({extended:true}));

 //Static folder for uploads
 app.use('/uploads',express.static(path.join(__dirname,'uploads')));

 //Routes
 app.use('/api/auth',authRoutes)
 app.use('/api/documents',documentRoutes)
app.use('/api/flashcards',flashcardRoutes)
app.use('/api/quizzes',quizRoutes)
app.use('/api/ai',aiRoutes)
app.use('/api/progress',progressRoutes)
app.use(errorHandler);


 //Start server
 const PORT = process.env.PORT || 8000
 app.listen(PORT,()=>{
    console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
 })

 process.on('unhandledRejection',(err)=>{
    console.error( `Error: ${err.message}`);
    process.exit(1);
 })

 app.get("/", (req, res) => {
  res.send("Backend is running");
});

 //404 handler
 app.use((req,res)=>{
    res.status(404).json({success:false,error:'Route not found',statusCode:404})
 })
