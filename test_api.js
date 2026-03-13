import http from 'http';

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/chat/sessions?tenantId=94aece93-be80-4cf4-b13c-a464751394d9',
    method: 'GET'
};

const req = http.request(options, res => {
    console.log(`statusCode: ${res.statusCode}`);

    let data = '';
    res.on('data', d => {
        data += d;
    });

    res.on('end', () => {
        console.log('Response Body Preview:');
        console.log(data.substring(0, 500));
        try {
            const json = JSON.parse(data);
            console.log(`Total sessions returned: ${json.length}`);
        } catch (e) {
            console.log('Response is not valid JSON');
        }
    });
});

req.on('error', error => {
    console.error(error);
});

req.end();
