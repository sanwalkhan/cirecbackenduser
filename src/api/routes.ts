import { ResponseToolkit, Server } from "@hapi/hapi";
import * as aboutUsEndpoint from "./endpoints/about";
import * as articleEndpoints from "./endpoints/article";
import * as chemicalLinksEndpoints from "./endpoints/chemical-links";
import * as contactUsEndpoints from "./endpoints/contact-us";
import * as defaultPage from "./endpoints/default";
import * as generateReportsEndpoints from "./endpoints/generate-reports";
import * as latestIssuesEndpoints from "./endpoints/latest-issues";
import * as newsEndpoints from "./endpoints/news";
import * as searchDatabaseEndpoints from "./endpoints/search-engine";
import * as statDbEndpoints from "./endpoints/statdb";
import * as userEndpoints from "./endpoints/subscription";
import * as upcomingEventsEndpoints from "./endpoints/upcoming-events";
import * as userProfileEndpoints from "./endpoints/user";

export const setupRoutes = (server: Server) => {
  //Default Page
  server.route({
    method: "GET",
    path: "/default",
    options: defaultPage.getDefaultPageContentOptions,
  });

  

  //Registration & Authentication
  server.route({
    method: ["POST"],
    path: "/user/login",
    options: userEndpoints.signInUserOptions,
  });

  server.route({
    method: "POST",
    path: "/user/registration/signup",
    options: userEndpoints.signUpUserOptions,
  });

  server.route({
    method: "POST",
    path: "/user/calculate/subscription/total/bill",
    options: userEndpoints.getSubscriptionBillTotalOptions,
  });

  //Password Manager
  server.route({
    method: "POST",
    path: "/user/password/manager",
    options: userEndpoints.passwordManagerOptions,
  });

  //Latest Issues
  server.route({
    method: "GET",
    path: "/latest/issues",
    options: latestIssuesEndpoints.getLatestIssuesOptions,
  });

  //Search Database
  server.route({
    method: "GET",
    path: "/search/database",
    options: searchDatabaseEndpoints.searchDatabaseOptions,
  });

  //Article
  server.route({
    method: "GET",
    path: "/article",
    options: articleEndpoints.getArticleByIdOptions,
  });

  //News
  server.route({
    method: "GET",
    path: "/shownews",
    options: newsEndpoints.getPdfNewsOptions,
  });

  server.route({
    method: "GET",
    path: "/monthlyNews",
    options: newsEndpoints.getMonthlyNewsOptions,
  });

  //about us
  server.route({
    method: "GET",
    path: "/aboutUs",
    options: aboutUsEndpoint.getAboutUsPageContent,
  });

  //Contact Us
  server.route({
    method: 'GET',
    path: '/contactUs/content',
    options: contactUsEndpoints.getContactUsPageContent,
  });

  server.route({
    method: 'POST',
    path: '/contactUs/sendMail',
    options: contactUsEndpoints.sendContactUsMail,
  });

  //upcoming events
  server.route({
    method: 'GET',
    path: '/upcoming/events',
    options: upcomingEventsEndpoints.getUpcomingEventsOptions,
  });

  //chemical links
  server.route({
    method: 'GET',
    path: '/chemical/links',
    options: chemicalLinksEndpoints.getChemicalLinksOptions,
  });

  //User
  server.route({
    method: 'GET',
    path: '/user/profile/info',
    options: userProfileEndpoints.getUserInfoOptions,
  });

  server.route({
    method: 'POST',
    path: '/user/profile/info/update',
    options: userProfileEndpoints.updateUserInfoOptions,
  });

  //statdb
  server.route({
    method: 'GET',
    path: '/statdb/content',
    options: statDbEndpoints.getStatDbOptions,
  });

  //statdb reports
  server.route({
    method: 'GET',
    path: '/statdb/report-chart1',
    options: generateReportsEndpoints.getReportChart1Options,
  });

  server.route({
    method: 'GET',
    path: '/statdb/report-chart2',
    options: generateReportsEndpoints.getReportChart2Options,
  });

  server.route({
    method: 'GET',
    path: '/statdb/report-chart3',
    options: generateReportsEndpoints.getReportChart3Options,
  });

  server.route({
    method: 'GET',
    path: '/statdb/report-fin-chart2',
    options: generateReportsEndpoints.getFinancialReportChart2Options,
  });

  server.route({
    method: 'GET',
    path: '/statdb/report-fin-chart3',
    options: generateReportsEndpoints.getReportFinChart3Options,
  });

  server.route({
    method: 'GET',
    path: '/statdb/report-russia-domestic',
    options: generateReportsEndpoints.getRussianDomesticSalesOptions,
  });

  server.route({
    method: 'GET',
    path: '/statdb/report-russia-exports',
    options: generateReportsEndpoints.getRussianExportSalesOptions,
  });

  server.route({
    method: 'GET',
    path: '/statdb/report-polish-chem',
    options: generateReportsEndpoints.getPolishChemicalProductionOptions,
  });

  server.route({
    method: 'GET',
    path: '/statdb/report-polish-chem-export',
    options: generateReportsEndpoints.getPolishChemicalExportOptions,
  });

  server.route({
    method: 'GET',
    path: '/statdb/report-polish-chem-import',
    options: generateReportsEndpoints.getPolishChemicalImportOptions,
  });

  server.route({
    method: 'GET',
    path: '/statdb/report-olefins-polyolefins',
    options: generateReportsEndpoints.getOlefinsPolyolefinReportOptions,
  });
  };
