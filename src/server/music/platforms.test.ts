import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validId } from './ids.ts';
import { image, mapListSong, mapRichSong, mapSearchSong, splitSongKey } from './kugou/mappers.ts';

test('validates ids per platform', () => {
  assert.equal(validId('netease', 'song', '186016'), true);
  assert.equal(validId('netease', 'song', 'abc'), false);
  assert.equal(validId('qq', 'song', '0039MnYb0qxYhV.97773'), true);
  assert.equal(validId('qq', 'playlist', '7039470158'), true);
  assert.equal(validId('kugou', 'song', 'b3a52a7a958bf0aed0ebfba2e9a818b7.966846.32100650'), true);
  assert.equal(validId('kugou', 'playlist', 'collection_3_484289804_26_0'), true);
  assert.equal(validId('kugou', 'playlist', '8888'), true);
  assert.equal(validId('kugou', 'song', '../etc/passwd'), false);
});

test('kugou artwork fills the size placeholder and upgrades to https', () => {
  assert.equal(image('http://imge.kugou.com/stdmusic/{size}/a.jpg', 240), 'https://imge.kugou.com/stdmusic/240/a.jpg');
  assert.equal(image(''), undefined);
});

test('kugou song keys round-trip hash, album and album_audio ids', () => {
  const track = mapSearchSong({
    FileHash: 'B3A52A7A958BF0AED0EBFBA2E9A818B7', AlbumID: '966846', MixSongID: 32100650, OriSongName: '晴天',
    Singers: [{ id: 3520, name: '周杰伦' }], AlbumName: '叶惠美', Duration: 269, PayType: 3,
  });
  assert.equal(track.id, 'b3a52a7a958bf0aed0ebfba2e9a818b7.966846.32100650');
  assert.deepEqual(splitSongKey(track.id), { hash: 'b3a52a7a958bf0aed0ebfba2e9a818b7', albumId: '966846', albumAudioId: '32100650' });
  assert.equal(track.artist, '周杰伦');
  assert.equal(track.duration, 269);
  assert.equal(track.vip, true);
});

test('kugou playlist rows take the title from "歌手 - 歌名"', () => {
  const track = mapListSong({ hash: 'ABC', name: '邓岳章 - 吴哥窟', album_id: '55472117', mixsongid: 1, timelen: 208000, singerinfo: [{ id: 1, name: '邓岳章' }] });
  assert.equal(track.title, '吴哥窟');
  assert.equal(track.duration, 208);
});

test('kugou chart/artist rows read nested audio and album info', () => {
  const track = mapRichSong({
    songname: '晴天', album_id: 966846, album_audio_id: 32100650, authors: [{ author_id: 3520, author_name: '周杰伦' }],
    audio_info: { hash_128: 'B3A5', duration_128: 269000 }, album_info: { album_name: '叶惠美', sizable_cover: 'http://x/{size}/c.jpg' },
  });
  assert.equal(track.id, 'b3a5.966846.32100650');
  assert.equal(track.cover, 'https://x/240/c.jpg');
  assert.equal(track.album, '叶惠美');
});
