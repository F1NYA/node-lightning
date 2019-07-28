// @ts-check

const { Channel } = require('../channel');

/**
 * @typedef {import("@lntools/wire").ChannelAnnouncementMessage} ChannelAnnouncementMessage
 */

exports.channelFromMessage = channelFromMessage;

/**
 * Constructs an incomplete channel from a node announcement message. The channel does
 * not include outpoint, capacity, or per node settings found in channel_update
 * messages. These values need to be set elsewhere.
 * @param {ChannelAnnouncementMessage} msg
 * @returns {Channel}
 */
function channelFromMessage(msg) {
  let c = new Channel();
  c.shortChannelId = msg.shortChannelId;
  c.chainHash = msg.chainHash;
  c.features = msg.features;
  c.nodeId1 = msg.nodeId1;
  c.nodeId2 = msg.nodeId2;
  c.bitcoinKey1 = msg.bitcoinKey1;
  c.bitcoinKey2 = msg.bitcoinKey2;
  c.nodeSignature1 = msg.nodeSignature1;
  c.nodeSignature2 = msg.nodeSignature2;
  c.bitcoinSignature1 = msg.bitcoinSignature1;
  c.bitcoinSignature2 = msg.bitcoinSignature2;
  return c;
}
