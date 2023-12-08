const AWS = require("aws-sdk");

const s3 = new AWS.S3();

const uploadImageToS3 = (image) => {
  // Configuration parameters for the S3 upload
  const imageName = `${Date.now()}.${image.originalname.split(".").pop()}`;
  const params = {
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: imageName,
    Body: image.buffer,
    ACL: "public-read",
    ContentType: image.mimetype,
  };

  // Upload the image to S3 bucket
  return s3.upload(params).promise();
};

const deleteImageFromS3 = (imageUrl) => {
  const key = imageUrl.split("/").pop();

  const params = {
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: key,
  };

  return s3.deleteObject(params).promise();
};

exports.uploadImageToS3 = uploadImageToS3;
exports.deleteImageFromS3 = deleteImageFromS3;
