import urllib.request, json, time

payload = {
    'model': 'qwen3.5:2b',
    'messages': [
        {
            'role': 'system',
            'content': 'Bạn là Trợ lý vận hành QBiz Kho (App Scope: qbiz-kho). Bạn phân tích câu nói tự nhiên của người dùng và trả về DUY NHẤT 1 JSON object hợp lệ theo schema quy định. Giải thích ngắn gọn dưới 10 từ. Tuyệt đối không sinh thêm văn bản hay suy nghĩ bên ngoài JSON.'
        },
        {
            'role': 'user',
            'content': '[SCHEMA YÊU CẦU: Trả về DUY NHẤT 1 JSON object hợp lệ: {"intent":"QUERY_STOCK"|"RECEIVE_STOCK"|"TRANSFER_STOCK"|"STOCKTAKE_STOCK"|"ADD_CART"|"REMOVE_CART"|"QUERY_MEMORY"|"GENERAL_QUERY"|"UNKNOWN","entities":{"product_name":string|null,"warehouse_name":string|null,"quantity":number|null},"confidence":0.0-1.0,"explanation":"ngắn gọn"}]\n[NGỮ CẢNH: Màn hình dashboard]\n[USER QUERY]\nxem mặt hàng nào gần hết'
        },
        {'role': 'assistant', 'content': '{\n'}
    ],
    'options': {
        'num_predict': 250,
        'num_thread': 10,
        'temperature': 0.1
    },
    'stream': False
}

t0 = time.time()
req = urllib.request.Request('http://127.0.0.1:11434/api/chat', data=json.dumps(payload).encode('utf-8'), headers={'Content-Type': 'application/json'})
with urllib.request.urlopen(req, timeout=30) as resp:
    res = json.loads(resp.read().decode('utf-8'))
    dur = round(time.time() - t0, 2)
    print(f'Duration: {dur}s')
    print('Output:\n{\n' + res.get('message', {}).get('content', ''))
