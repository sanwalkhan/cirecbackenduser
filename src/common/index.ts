export const config = {
    version: String(process.env.VERSION),
    port: Number(process.env.PORT),
    host: String(process.env.HOST),

    //jwt secret key
    authSecret: `${String(process.env.JWT_SECRET_KEY || "somesecret")}`,

    passwordSalt: String(process.env.PASSWORD_SALT),
    saltRound: Number(process.env.SALT_ROUND),

    enviornment: String(process.env.ENVIORNMENT),

    supportEmailReceiver: String(process.env.DEVELOPEMENT_SUPPORT_EMAIL_RECEIVER!)
};