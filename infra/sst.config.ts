/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "funnelai",
      removal: input?.stage === "prod" ? "retain" : "remove",
      home: "aws",
      providers: {
        aws: {
          region: "us-east-1",
        },
      },
    }
  },
  async run() {
    // --- 1. Storage & CDN ---------------------------------------------------
    const assetsBucket = new sst.aws.Bucket("FunnelAIAssets", {
      access: "public",
    })

    const cdn = new sst.aws.Cdn("FunnelAICdn", {
      sources: [
        {
          domainName: assetsBucket.domainName,
          originId: "S3Origin",
        },
      ],
    })

    // --- 2. Database & Cache ------------------------------------------------
    const db = new sst.aws.Postgres("FunnelAIDb", {
      database: "funnelai",
    })

    const redis = new sst.aws.Redis("FunnelAIRedis")

    // --- 3. Microservices (ECS Fargate Tasks) ------------------------------
    const s2cService = new sst.aws.Service("ScreenshotToCodeService", {
      cluster: true,
      image: {
        context: "./services/screenshot-to-code",
        dockerfile: "Dockerfile",
      },
      environment: {
        IS_PROD: "true",
        PORT: "7001",
      },
    })

    const scannerService = new sst.aws.Service("ScannerService", {
      cluster: true,
      image: {
        context: "./apps/scanner",
        dockerfile: "Dockerfile",
      },
      environment: {
        DATABASE_URL: db.url,
        REDIS_URL: redis.url,
        SCREENSHOT_TO_CODE_URL: $interpolate`http://${s2cService.url}:7001`,
        S3_BUCKET_NAME: assetsBucket.name,
        CDN_URL: cdn.url,
      },
      link: [assetsBucket, db, redis],
    })

    // --- 4. Next.js Web Application ----------------------------------------
    const webApp = new sst.aws.Nextjs("FunnelAIWeb", {
      path: "apps/web",
      link: [assetsBucket, db, redis],
      environment: {
        DATABASE_URL: db.url,
        REDIS_URL: redis.url,
        SCANNER_SERVICE_URL: scannerService.url,
        CDN_URL: cdn.url,
      },
    })

    return {
      webUrl: webApp.url,
      scannerUrl: scannerService.url,
      cdnUrl: cdn.url,
      dbUrl: db.url,
    }
  },
})
