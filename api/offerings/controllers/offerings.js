'use strict';

/**
 * Read the documentation (https://strapi.io/documentation/3.0.0-beta.x/concepts/controllers.html#core-controllers)
 * to customize this controller
 */
const _ = require('lodash');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const { sanitizeEntity } = require('strapi-utils');

module.exports = {
  async find(ctx) {

    const offerings = (await strapi.services.offerings.find(ctx.query))
    .map((o) => {
      if (o.user) {
        delete o.user.password;
      }
      return {
        ...o,
        videos: o.videos.map(v => ({ ...v, thumbnail: `/uploads/${v.name.split('.')[0]}.png`}))
      }
    });

    // Send 200 `ok`
    ctx.send(offerings);
  },
  async findOne(ctx) {
    const entity = await strapi.services.offerings.findOne(ctx.params);
    entity.videos = entity.videos.map(v => ({ ...v, thumbnail: `/uploads/${v.name.split('.')[0]}.png`}));
    const data = sanitizeEntity(entity, { model: strapi.models.offerings });

    // Send 200 `ok`
    ctx.send(data);
  },
    following: async (ctx) => {
        const currentUser = await strapi.plugins['users-permissions'].services.user.fetch({ id: 11 })
        const followedUser = await Promise.all(currentUser.following.map(u => {
            return strapi.plugins['users-permissions'].services.user.fetch({ id: u.id })
        }))

        const offeringsFromFollowedUsers = (followedUser.map(u => u.offerings)).reduce((acc, val) => acc.concat(val), []);

        const currentNotifications = await strapi.services.notifications.find({ user: currentUser.id })
        const nonSavedNotifications = offeringsFromFollowedUsers.map(offering => {
            const notification = currentNotifications.find(CN => offering.id === CN.offering.id)

            if (!notification) {
                return strapi.services.notifications.create({ user: currentUser.id, offering, wasRead: false })
            }

            return null;

        }).filter(n => n !== null);

        await Promise.all(nonSavedNotifications)
        const nonReadNotifications = (await strapi.services.notifications.find({ user: currentUser.id }))
            .map(n => {
                delete n.user;
                return n;
            })


        ctx.send(nonReadNotifications);
    },
    upload: async (ctx) => {
        const uploadService = strapi.plugins.upload.services.upload;

        // Retrieve provider configuration.
        const config = await strapi
          .store({
            environment: strapi.config.environment,
            type: 'plugin',
            name: 'upload',
          })
          .get({ key: 'provider' });
    
        // Verify if the file upload is enable.
        if (config.enabled === false) {
          return ctx.badRequest(
            null,
    
            [
              {
                messages: [
                  {
                    id: 'Upload.status.disabled',
                    message: 'File upload is disabled',
                  },
                ],
              },
            ]
          );
        }
    
        // Extract optional relational data.
        const { refId, ref, source, field, path } = ctx.request.body || {};
        const { files = {} } = ctx.request.files || {};
    
        if (_.isEmpty(files)) {
          return ctx.badRequest(null, [
            {
              messages: [{ id: 'Upload.status.empty', message: 'Files are empty' }],
            },
          ]);
        }
    
        // Transform stream files to buffer
        const buffers = await uploadService.bufferize(files);
    
        const enhancedFiles = buffers.map(file => {
          if (file.size > config.sizeLimit) {
            return ctx.badRequest(null, [
              {
                messages: [
                  {
                    id: 'Upload.status.sizeLimit',
                    message: `${file.name} file is bigger than limit size!`,
                    values: { file: file.name },
                  },
                ],
              },
            ]);
          }
    
          // Add details to the file to be able to create the relationships.
          if (refId && ref && field) {
            Object.assign(file, {
              related: [
                {
                  refId,
                  ref,
                  source,
                  field,
                },
              ],
            });
          }
    
          // Update uploading folder path for the file.
          if (path) {
            Object.assign(file, {
              path,
            });
          }
    
          return file;
        });
    
        // Something is wrong (size limit)...
        if (ctx.status === 400) {
          return;
        }

        const videoFiles = enhancedFiles.filter(f => f.mime.includes('video'))
        if (videoFiles.length !== 0) {
          const thumbnails = videoFiles.map(v => {

            return new Promise((res, rej) => {
              ffmpeg(`${v.tmpPath}`)
              .on('end', function(end) {
                res(end)
              })
              .on('error', function(err) {
                rej(err)
              })
              .screenshots({
                count: 1,
                folder: `${strapi.config.public.path}/uploads/`,
                filename: `${v.name.split('.')[0]}`,
              });
            });
          });

          await Promise.all(thumbnails);

        }
    
        const uploadedFiles = await uploadService.upload(enhancedFiles, config);

        // Send 200 `ok`
        ctx.send(uploadedFiles.map(f => ({ ...f, thumbnail: `/uploads/${f.name.split('.')[0]}.png` })));
    },
    async destroyFile(ctx) {
      const { id } = ctx.params;
      const config = await strapi
        .store({
          environment: strapi.config.environment,
          type: 'plugin',
          name: 'upload',
        })
        .get({ key: 'provider' });
  
      const file = await strapi.plugins['upload'].services.upload.fetch({ id });
  
      if (!file) {
        return ctx.notFound('file.notFound');
      }
  
      await strapi.plugins['upload'].services.upload.remove(file, config);

      const thumbnailRoute = `${strapi.config.public.path}/uploads/${file.name.split('.')[0]}.png`;
      if (fs.existsSync(thumbnailRoute)) {
        fs.unlinkSync(thumbnailRoute)
      }

      ctx.send(file);
    }
};
