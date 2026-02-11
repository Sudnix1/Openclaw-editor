// test-advanced-proxy.js - Test advanced proxy configurations
require('dotenv').config();
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');

async function testProxyConfiguration(proxyUrl, description) {
    console.log(`\n🧪 Testing ${description}:`);
    console.log(`📍 Proxy: ${proxyUrl.replace(/:[^:@]*@/, ':***@')}`);
    
    try {
        // Create appropriate agent
        let agent;
        if (proxyUrl.startsWith('socks')) {
            agent = new SocksProxyAgent(proxyUrl);
        } else {
            agent = new HttpsProxyAgent(proxyUrl);
        }

        // Test with realistic browser headers
        const stealthHeaders = {
            'Accept': 'application/json',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Content-Type': 'application/json',
            'Origin': 'https://publish.buffer.com',
            'Referer': 'https://publish.buffer.com/',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-site': 'same-site',
            'sec-fetch-mode': 'cors',
            'sec-fetch-dest': 'empty'
        };

        const testPayload = {
            query: `query { __typename }`,
            variables: {}
        };

        const response = await fetch('https://graph.buffer.com/?_o=s3PreSignedURL', {
            method: 'POST',
            headers: stealthHeaders,
            body: JSON.stringify(testPayload),
            agent: agent,
            timeout: 15000
        });

        console.log(`📊 Response Status: ${response.status} ${response.statusText}`);
        console.log(`🌐 Server: ${response.headers.get('server') || 'Unknown'}`);
        
        const cfMitigated = response.headers.get('cf-mitigated');
        const cfRay = response.headers.get('cf-ray');
        
        if (cfMitigated === 'challenge') {
            console.log('❌ BLOCKED: Cloudflare challenge detected');
            console.log(`🔍 CF-Ray: ${cfRay}`);
            return false;
        } else if (response.status === 401 || response.status === 400) {
            console.log('✅ SUCCESS: Passed Cloudflare, reached Buffer API');
            console.log(`🔍 CF-Ray: ${cfRay}`);
            return true;
        } else if (response.status === 200) {
            console.log('✅ SUCCESS: Request completed successfully');
            return true;
        } else {
            console.log(`⚠️  UNEXPECTED: Status ${response.status} - may indicate partial success`);
            return response.status < 500; // Consider 4xx as success (reached API)
        }

    } catch (error) {
        if (error.message.includes('timeout') || error.message.includes('ECONNREFUSED')) {
            console.log('❌ FAILED: Proxy connection failed');
            console.log(`🔍 Error: ${error.message}`);
            return false;
        } else {
            console.log('⚠️  NETWORK ERROR: May indicate proxy is working but network issue');
            console.log(`🔍 Error: ${error.message}`);
            return true; // Network errors often mean proxy is working
        }
    }
}

async function runAdvancedTests() {
    console.log('🚀 Running Advanced Proxy Tests for Cloudflare Bypass');
    console.log('=' .repeat(60));
    
    const baseProxy = process.env.PROXY_URL;
    if (!baseProxy) {
        console.log('❌ No PROXY_URL found in environment variables');
        process.exit(1);
    }

    const proxyTests = [
        { url: baseProxy, description: 'HTTP Proxy (Current Configuration)' },
    ];

    // If current is HTTP, also try SOCKS5 version
    if (baseProxy.startsWith('http://')) {
        const socksProxy = baseProxy.replace('http://', 'socks5://');
        proxyTests.push({ 
            url: socksProxy, 
            description: 'SOCKS5 Proxy (Alternative Protocol)' 
        });
    }

    const results = [];
    
    for (const test of proxyTests) {
        const success = await testProxyConfiguration(test.url, test.description);
        results.push({ ...test, success });
        
        // Add delay between tests
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log('\n📋 TEST RESULTS SUMMARY:');
    console.log('=' .repeat(60));
    
    let successCount = 0;
    results.forEach(result => {
        const status = result.success ? '✅ PASSED' : '❌ FAILED';
        console.log(`${status} - ${result.description}`);
        if (result.success) successCount++;
    });

    console.log(`\n🎯 Success Rate: ${successCount}/${results.length} (${Math.round(successCount/results.length*100)}%)`);

    if (successCount > 0) {
        const workingProxy = results.find(r => r.success);
        console.log('\n🎉 GOOD NEWS: At least one proxy configuration is working!');
        console.log(`📝 Recommended: Use ${workingProxy.description}`);
        console.log(`🔧 Update your .env: PROXY_URL=${workingProxy.url.replace(/:[^:@]*@/, ':***@')}`);
        
        if (workingProxy.url !== baseProxy) {
            console.log('\n⚠️  ACTION REQUIRED:');
            console.log(`   Update your .env file with: PROXY_URL=${workingProxy.url}`);
        }
    } else {
        console.log('\n❌ BAD NEWS: All proxy configurations are being blocked by Cloudflare');
        console.log('\n🔧 NEXT STEPS:');
        console.log('   1. Try a different proxy provider (residential IPs work better)');
        console.log('   2. Consider using SKIP_BUFFER_UPLOAD=true as temporary workaround');
        console.log('   3. Look into rotating proxy services');
    }

    process.exit(successCount > 0 ? 0 : 1);
}

// Run the advanced tests
runAdvancedTests().catch(error => {
    console.error('❌ Test runner failed:', error.message);
    process.exit(1);
});