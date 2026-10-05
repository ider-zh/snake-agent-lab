import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
 testDir:'./tests', fullyParallel:false, workers:1, timeout:90000,
 expect:{timeout:15000}, reporter:[['list'],['html',{open:'never'}]],
 use:{baseURL:process.env.PLAYWRIGHT_BASE_URL??'http://127.0.0.1:4173',trace:'retain-on-failure',screenshot:'only-on-failure'},
 projects:[{name:'chromium-desktop',use:{...devices['Desktop Chrome'],viewport:{width:1440,height:1000}}},{name:'chromium-mobile',use:{...devices['iPhone 13'],defaultBrowserType:'chromium'}}],
 webServer:process.env.PLAYWRIGHT_BASE_URL?undefined:{command:'npm run preview -- --host 127.0.0.1 --port 4173',url:'http://127.0.0.1:4173',reuseExistingServer:!process.env.CI},
});
