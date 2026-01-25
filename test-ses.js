// test-ses.js
import dotenv from 'dotenv';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

// 1. Load Environment Variables
dotenv.config();

console.log("\n--- 🔍 AWS SES DIAGNOSTIC TOOL ---");

// 2. Check if .env is loaded correctly
const region = process.env.AWS_REGION;
console.log(`1. Checking Configuration:`);
console.log(`   - Region: ${region || "❌ MISSING"}`);
console.log(`   - Access Key: ${process.env.AWS_ACCESS_KEY_ID ? process.env.AWS_ACCESS_KEY_ID.slice(0, 5) + "..." : "❌ MISSING"}`);
console.log(`   - Secret Key: ${process.env.AWS_SECRET_ACCESS_KEY ? "loaded (hidden)" : "❌ MISSING"}`);
console.log(`   - From Email: ${process.env.SES_FROM_EMAIL || "❌ MISSING"}`);

if (!region || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY || !process.env.SES_FROM_EMAIL) {
    console.error("\n❌ CRITICAL ERROR: Missing variables in .env file.");
    process.exit(1);
}

// 3. Initialize SES Client
const ses = new SESClient({
    region: region,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

// 4. Attempt to Send Email
const runTest = async () => {
    // Send to the SAME email to ensure it works even in Sandbox mode (if verified)
    const toEmail = process.env.SES_FROM_EMAIL;
    console.log(`\n2. Attempting to send test email to: ${toEmail}...`);

    const params = {
        Destination: { 
            ToAddresses: [toEmail] 
        },
        Message: {
            Body: { 
                Text: { Data: "If you are reading this, your AWS SES setup is PERFECT! ✅" } 
            },
            Subject: { Data: "Stribble SES Test Connection" },
        },
        Source: process.env.SES_FROM_EMAIL,
    };

    try {
        const result = await ses.send(new SendEmailCommand(params));
        console.log("\n✅ SUCCESS! Email sent successfully.");
        console.log(`   Message ID: ${result.MessageId}`);
        console.log("\n--> Go check your inbox for the email.");
    } catch (err) {
        console.error("\n❌ FAILED: Email could not be sent.");
        console.error("---------------------------------------------------");
        console.error(`Error Code:    ${err.name}`);
        console.error(`Error Message: ${err.message}`);
        console.error("---------------------------------------------------");

        // 5. Intelligent Error Analysis
        if (err.name === 'MessageRejected') {
            console.log("\n💡 DIAGNOSIS: SANDBOX MODE BLOCKED IT");
            console.log("   You are likely in AWS SES Sandbox mode.");
            console.log("   In Sandbox, you can ONLY send emails to 'Verified Identities'.");
            console.log("   Solution: Verify the 'To' email address in AWS Console OR request Production Access.");
        } 
        else if (err.name === 'AccessDeniedException' || err.message.includes("User is not authorized")) {
            console.log("\n💡 DIAGNOSIS: PERMISSION MISSING");
            console.log("   Your IAM User has keys, but NO permission to use SES.");
            console.log("   Solution: Go to IAM > Users > [Your User] > Permissions > Add 'AmazonSESFullAccess'.");
        } 
        else if (err.name === 'InvalidClientTokenId' || err.name === 'UnrecognizedClientException' || err.name === 'InvalidSignatureException') {
            console.log("\n💡 DIAGNOSIS: INVALID KEYS");
            console.log("   The keys in your .env file are wrong, deleted, or inactive.");
            console.log("   Solution: Create new keys in IAM and update .env.");
        }
    }
};

runTest();