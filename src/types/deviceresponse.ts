import type { deviceList } from './devicelist';
import type { infraredRemoteList } from './irdevicelist';


//json response from SwitchBot API
export type devices = {
  statusCode: 100 | 190 | 'n/a';
  message: string;
  body: body;
};

type body = {
  deviceList: deviceList;
  infraredRemoteList: infraredRemoteList;
};