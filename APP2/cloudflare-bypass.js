// cloudflare-bypass.js - Advanced Cloudflare bypass utilities
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');

class CloudflareBypass {
    constructor(proxyUrl = null) {
        this.proxyUrl = proxyUrl;
        this.agent = null;
        this.setupAgent();
    }

    setupAgent() {
        if (this.proxyUrl) {
            if (this.proxyUrl.startsWith('socks')) {
                this.agent = new SocksProxyAgent(this.proxyUrl);
            } else {
                this.agent = new HttpsProxyAgent(this.proxyUrl);
            }
        }
    }

    // Generate realistic browser headers with randomization
    generateStealthHeaders(cookieHeader = '') {
        const userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ];

        const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];

        return {
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Content-Type': 'application/json',
            'Origin': 'https://publish.buffer.com',
            'Referer': 'https://publish.buffer.com/',
            'User-Agent': randomUA,
            'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-site': 'same-site',
            'sec-fetch-mode': 'cors',
            'sec-fetch-dest': 'empty',
            'DNT': '1',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            ...(cookieHeader && { 'Cookie': cookieHeader })
        };
    }

    // Fetch with advanced retry logic and stealth measures
    async stealthFetch(url, options = {}, maxRetries = 3) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                // Add random delay between attempts
                if (attempt > 1) {
                    const delay = Math.random() * 3000 + 2000; // 2-5 second random delay
                    console.log(`⏳ Stealth delay: ${Math.round(delay)}ms before attempt ${attempt}...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }

                const stealthOptions = {
                    ...options,
                    agent: this.agent,
                    timeout: 30000,
                    compress: true,
                    headers: {
                        ...this.generateStealthHeaders(options.cookieHeader),
                        ...options.headers
                    }
                };

                console.log(`🔄 Stealth attempt ${attempt}/${maxRetries} to ${url}`);
                
                const response = await fetch(url, stealthOptions);
                
                console.log(`📊 Response: ${response.status} ${response.statusText}`);
                const cfRay = response.headers.get('cf-ray');
                const cfMitigated = response.headers.get('cf-mitigated');
                
                if (cfRay) console.log(`🌐 CF-Ray: ${cfRay}`);

                // Check if we're being challenged
                if (response.status === 403 && cfMitigated === 'challenge') {
                    console.log(`❌ Attempt ${attempt}: Cloudflare challenge detected`);
                    if (attempt === maxRetries) {
                        throw new Error('All stealth attempts failed - Cloudflare protection active');
                    }
                    continue; // Try again with different headers/timing
                }

                // Success cases
                if (response.status < 500) {
                    console.log(`✅ Stealth success on attempt ${attempt}!`);
                    return response;
                }

                console.log(`⚠️  Attempt ${attempt}: Server error ${response.status}`);
                if (attempt === maxRetries) {
                    return response; // Return the response even if it's an error
                }

            } catch (error) {
                console.log(`❌ Attempt ${attempt} failed:`, error.message);
                if (attempt === maxRetries) {
                    throw error;
                }
            }
        }
    }

    // Buffer-specific GraphQL request with full stealth mode
    async bufferGraphQLRequest(query, variables = {}, cookieHeader = '') {
        const payload = {
            query,
            variables
        };

        return await this.stealthFetch('https://graph.buffer.com/?_o=s3PreSignedURL', {
            method: 'POST',
            body: JSON.stringify(payload),
            cookieHeader
        });
    }

    // S3 upload with stealth
    async s3Upload(url, buffer, contentType = 'image/png') {
        return await this.stealthFetch(url, {
            method: 'PUT',
            body: buffer,
            headers: {
                'Content-Type': contentType
            }
        }, 1); // Only 1 retry for S3 uploads
    }

    // Buffer API finalize with stealth
    async bufferFinalize(payload, cookieHeader = '') {
        return await this.stealthFetch('https://publish.buffer.com/rpc/composerApiProxy', {
            method: 'POST',
            body: JSON.stringify(payload),
            cookieHeader
        });
    }
}

module.exports = { CloudflareBypass };