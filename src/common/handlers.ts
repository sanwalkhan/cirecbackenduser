import nodemailer from "nodemailer";
import hbs from 'nodemailer-express-handlebars';
import path from "path";
import { config } from ".";

const transporter = nodemailer.createTransport({
    host: String(process.env.VERIFY_EMAIL_HOST),
    port: Number(process.env.VERIFY_EMAIL_PORT),
    secure: true,
    auth: {
        user: String(process.env.VERIFY_EMAIL_SENDER),
        pass: String(process.env.VERIFY_EMAIL_SENDER_PASS),
    },
});

export enum EmailType {
    FORGOT_PASSWORD_CREDIENTIALS_RESEND,
    CONTACT_US_FORM_SUBMISSION,
    EMAIL_VERIFICATION,
    NEW_REGISTRATION_ALERT
}

// point to the template folder
const handlebarOptions = {
    viewEngine: {
        partialsDir: path.resolve(config.enviornment === 'development' ? "src/common/views/" : "views/"),
        defaultLayout: false as any,
    },
    viewPath: path.resolve(config.enviornment === 'development' ? "src/common/views/" : "views/"),
};

// use a template file with nodemailer
transporter.use('compile', hbs(handlebarOptions))

const sendEmail = async (receiver: string, subject: string, template: string, type: EmailType, context: any) => {

    var mailOptions = {
        from: String(process.env.VERIFY_EMAIL_SENDER), // sender address
        to: receiver, // list of receivers
        subject,
        template, // the name of the template file i.e email.handlebars
        context: {
            user: context.user,
            username: context.username,
            password: context.password,
            lname: context.lname,
            fname: context.fname,
            firstName: context.firstName,
            lastName: context.lastName,
            country: context.country,
            phone: context.phone,
            email: context.email,
            subject: context.subject,
            message: context.message,
            currentYear: new Date().getFullYear()
        },
    };

    // trigger the sending of the E-mail
    transporter.sendMail(mailOptions, function (error, info) {
        if (error) {
            return console.log(error);
        }
        console.log("Message sent: " + info.response);
    });
};

const generateVerificationCode = () => {
    const eVerificationCode = Math.floor(
        100000 + Math.random() * 900000
    ).toString();
    return eVerificationCode
}

export { generateVerificationCode, sendEmail };


