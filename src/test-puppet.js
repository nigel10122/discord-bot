import puppeteer from 'puppeteer';

const url = "https://wallpaperswide.com/";

(async () => {
  // Launch the browser and open a new blank page
  const browser = await puppeteer.launch({
    headless : false,
    slowMo : true
  });


  const page = await browser.newPage();

  // Navigate the page to a URL
  await page.goto(url);


  // Set screen size
  await page.setViewport({width: 1080, height: 1024});



  const image = await page.waitForXPath('//*[@id="content"]/ul/li[1]/div/div[4]/a/img');

  await image.click();

  const newPage = await page.waitForXPath('/html/body');

  const download = await newPage.waitForSelector('#dwres_btn')

  download.click();

  await browser.close();
})();