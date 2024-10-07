const express = require('express');
const multer = require('multer');
const AWS = require('aws-sdk');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg'); // ใช้ ffmpeg ดึงเฟรม
require('dotenv').config();
const app = express();
const upload = multer({ dest: 'uploads/' });

AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_KEY,
  region: process.env.AWS_REGION,
});

const s3 = new AWS.S3({
  region: process.env.AWS_REGION,
  endpoint: `https://s3.${process.env.AWS_REGION}.amazonaws.com`, // ใช้ backticks ที่ถูกต้อง
});

app.use(express.static('public'));
app.use('/frames', express.static('frames'));

app.post('/api/upload', upload.single('video'), (req, res) => {
  const videoFile = req.file;
  const videoPath = videoFile.path;
  const frameCount = parseInt(req.body.frameCount, 10); // รับจำนวนเฟรมที่ผู้ใช้ต้องการ
  const outputDir = 'frames';

  // สร้างโฟลเดอร์ 'frames' หากมันไม่มีอยู่
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  } else {
    // ลบไฟล์ในโฟลเดอร์ 'frames' หากมีอยู่แล้ว
    fs.readdirSync(outputDir).forEach(file => {
      fs.unlinkSync(`${outputDir}/${file}`);
      console.log(`Deleted old frame: ${file}`); // เพิ่ม log เพื่อตรวจสอบว่าไฟล์ถูกลบ
    });
  }

  const s3Params = {
    Bucket: 'mis-mytuypa',
    Key: `${Date.now()}_${videoFile.originalname}`, // ใช้ backticks ที่ถูกต้อง
    Body: fs.createReadStream(videoPath),
  };

  s3.upload(s3Params, (err, data) => {
    if (err) {
      console.error('Error uploading video to S3:', err);
      return res.status(500).send('Error uploading video to S3.');
    }
    console.log('Video uploaded to S3 successfully:', data.Location);

    // ดึงเฟรมจากวิดีโอตามจำนวนที่ระบุ
    ffmpeg(videoPath)
      .on('end', () => {
        console.log('Frames extracted successfully.');
        const frameFiles = fs.readdirSync(outputDir).map(file => `/frames/${file}`);
        res.json({
          message: `Extracted ${frameCount} frames from the video.`,
          frames: frameFiles.slice(0, frameCount), // ส่งเฟรมตามจำนวนที่ผู้ใช้เลือก
        });

        // ลบไฟล์วิดีโอหลังจากการประมวลผลเสร็จ
        fs.unlinkSync(videoPath);
      })
      .on('error', (err) => {
        console.error('Error extracting frames:', err);
        res.status(500).send('Error extracting frames.');
      })
      .screenshots({
        count: frameCount > 0 ? frameCount : 1, // ตรวจสอบให้แน่ใจว่าจำนวนเฟรมไม่ต่ำกว่า 1
        folder: outputDir,
        size: '320x240',
        filename: 'frame-%03d.png',
      });
  });
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
